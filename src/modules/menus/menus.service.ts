import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Menu } from './menu.entity/menu.entity';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';

const REDIS_KEY = 'menus:structure';
const REDIS_CHANNEL = 'menus:updated';

@Injectable()
export class MenusService {
  private logger = new Logger('MenusService');
  private redis: Redis;

  constructor(
    @InjectRepository(Menu)
    private menuRepository: Repository<Menu>
  ) {
    this.redis = new Redis(process.env.REDIS_URL);

    // Subscribe to Redis pub/sub to auto-refresh cache in other instances
    const subscriber = new Redis(process.env.REDIS_URL);
    subscriber.subscribe(REDIS_CHANNEL, (err) => {
      if (err) this.logger.error('Failed to subscribe to Redis channel', err);
    });

    subscriber.on('message', (channel, message) => {
      if (channel === REDIS_CHANNEL) {
        this.logger.log('Menu structure updated, refreshing cache');
        this.redis.del(REDIS_KEY);
      }
    });
  }

  // Normalize title into slug
  private slugify(text: string): string {
    return text.toLowerCase().trim().replace(/[\s\W]+/g, '-');
  }

  // Ensure menu row exists
  private async loadMenu(): Promise<Menu> {
    let menu = await this.menuRepository.findOne({ where: {} });
    if (!menu) {
      menu = this.menuRepository.create({ structure: [] });
      await this.menuRepository.save(menu);
    }
    return menu;
  }

  private findNode(nodes: any[], title: string): any | null {
    for (const node of nodes) {
      if (node.title === title) return node;
      if (node.children?.length) {
        const found = this.findNode(node.children, title);
        if (found) return found;
      }
    }
    return null;
  }
  

  // Get structure (Redis cache first)
  async getStructure(): Promise<any[]> {
    const cached = await this.redis.get(REDIS_KEY);
    if (cached) return JSON.parse(cached);

    const menu = await this.loadMenu();
    await this.redis.set(REDIS_KEY, JSON.stringify(menu.structure));
    return menu.structure;
  }

  // Set structure and update Redis + publish
  private async setStructure(structure: any[]) {
    const menu = await this.loadMenu();
    menu.structure = structure;
    await this.menuRepository.save(menu);

    await this.redis.set(REDIS_KEY, JSON.stringify(structure));
    await this.redis.publish(REDIS_CHANNEL, 'updated');
  }

  // Add menu/submenu using parentTitle
  // async addMenu(parentTitle: string | null, payload: { title: string, metadata?: any }): Promise<any> {
  //   const structure = await this.getStructure();
  //   const node = {
  //     id: uuidv4(),
  //     title: payload.title,
  //     slug: this.slugify(payload.title),
  //     children: [],
  //   };

  //   if (!parentTitle || parentTitle === 'null') {
  //     // Root-level menu
  //     structure.push(node);
  //   } else {
  //     const parentSlug = this.slugify(parentTitle);
  //     const parent = this.findNodeBySlug(structure, parentSlug);
  //     if (!parent) throw new Error(`Parent menu "${parentTitle}" not found`);
  //     parent.children.push(node);
  //   }

  //   await this.setStructure(structure);
  //   return node;
  // }
  async addMenu(
    parentTitle: string | null,
    payload: { title: string; metadata?: any }
  ): Promise<any> {
    const structure = await this.getStructure();
  
    const node = {
      id: uuidv4(),
      title: payload.title,
      slug: this.slugify(payload.title),
      metadata: payload.metadata || {},   // 👈 FIX ADDED
      children: [],
    };
  
    if (!parentTitle || parentTitle === 'null') {
      // Root-level menu
      structure.push(node);
    } else {
      const parentSlug = this.slugify(parentTitle);
      const parent = this.findNodeBySlug(structure, parentSlug);
      if (!parent) throw new Error(`Parent menu "${parentTitle}" not found`);
      parent.children.push(node);
    }
  
    await this.setStructure(structure);
    return node;
  }
  

  // Remove menu/submenu by id
  async removeNodeById(nodeId: string) {
    const structure = await this.getStructure();
    const newStructure = this.removeNodeRecursive(structure, nodeId);
    await this.setStructure(newStructure);
  }

  private removeNodeRecursive(nodes: any[], id: string): any[] {
    return nodes
      .filter(n => n.id !== id)
      .map(n => ({
        ...n,
        children: this.removeNodeRecursive(n.children || [], id),
      }));
  }

  // Find node by slug
  private findNodeBySlug(nodes: any[], slug: string): any | null {
    for (const node of nodes) {
      if (node.slug === slug) return node;
      if (node.children?.length) {
        const found = this.findNodeBySlug(node.children, slug);
        if (found) return found;
      }
    }
    return null;
  }

  // Convert structure to Telegraf inline keyboard
  toInlineKeyboard(nodes: any[]): any[] {
    return nodes.map(node => [{ text: node.title, callback_data: `menu:${node.slug}` }]);
  }

  // Search menu by title (returns first match)
  async findByTitle(title: string): Promise<any | null> {
    const structure = await this.getStructure();
    const slug = this.slugify(title);
    return this.findNodeBySlug(structure, slug);
  }

//   async findByTitle(title: string) {
//     const slug = this.slugify(title);
//     const structure = await this.getStructure();
  
//     return this.findNodeBySlug(structure, slug);
//   }

  async findById(id: string): Promise<any | null> {
    const structure = await this.getStructure();
    return this.findNodeById(structure, id);
  }

  private findNodeById(nodes: any[], id: string): any | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children?.length) {
        const found = this.findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  async updateMenu(id: string, dto: { title?: string }): Promise<any> {
    const structure = await this.getStructure();
  
    const updatedStructure = this.updateNodeRecursive(structure, id, dto);
  
    await this.setStructure(updatedStructure);
  
    // Return updated node
    return this.findById(id);
  }

  private updateNodeRecursive(nodes: any[], id: string, dto: any): any[] {
    return nodes.map(node => {
      if (node.id === id) {
        const updated = { ...node };
  
        if (dto.title) {
          updated.title = dto.title;
          updated.slug = this.slugify(dto.title);
        }
  
        return updated;
      }
  
      return {
        ...node,
        children: this.updateNodeRecursive(node.children || [], id, dto),
      };
    });
  }

  
  async findByUUID(id: string) {
    return this.findById(id);
  }
  
  async findOne(id: string): Promise<any | null> {
    const structure = await this.getStructure();
    return this.findNodeById(structure, id);
  }
  


}

