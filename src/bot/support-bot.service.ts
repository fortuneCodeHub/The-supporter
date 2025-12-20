import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { UsersService } from 'src/modules/users/users.service';
import { MenusService } from 'src/modules/menus/menus.service';
import { TicketsService } from 'src/modules/tickets/tickets.service';
import { generateUniqueTicketNumber, prepareFields } from 'src/common/utils/helper-functions';
import { ImagesService } from 'src/modules/images/images.service';
import { log } from 'console';
import { buildTicketEmailHtml } from 'src/common/utils/ticketMailHTML';
import { MailService } from 'src/modules/mail/mail.service';
import { Ticket } from 'src/modules/tickets/ticket.entity/ticket.entity';

type SessionShape = {
  path?: string[]; // slugs stack
  pathNodes?: any[]; // node objects stack (titles, slugs, ids, children)
//   state?: string | null; // 'COLLECTING_FIELDS' | 'AWAITING_TICKET_MESSAGE' | null
  state?: 'COLLECTING_FIELDS' | 'AWAITING_TICKET_MESSAGE' | 'CONFIRMING_TICKET' | null;

  ticket?: {
    type: string;
    tag: string;
    menuSlug: string;
    requiredFields: string[];
    collected: Record<string, any>;
    currentStep: number;
  } | null;
  pendingImages?: Buffer[]; // image buffers stored between steps
  pendingDocuments?: PendingDocument[];

  // management
  lastMessageTimestamp?: number; // throttling
  startedAt?: number; // session timeout start
  waitingForImageUpload?: boolean;
};

interface PendingDocument {
    fileName: string;
    mimeType: string;
    buffer: Buffer; // Node.js Buffer
}

@Injectable()
export class SupportBotService {
  private logger = new Logger('SupportBot');

  // session TTL in ms (10 minutes)
  private SESSION_TTL = 10 * 60 * 1000;
  // throttle window in ms
  private THROTTLE_MS = 600;

  constructor(
    @InjectBot('SUPPORT_BOT') private bot: Telegraf,
    private usersService: UsersService,
    private menusService: MenusService,
    private ticketsService: TicketsService,
    private imagesService: ImagesService,
    private mailService: MailService,
  ) {
    this.registerHandlers();
  }

  // --------------------
  // Helpers
  // --------------------
  private ensureSession(ctx: any): SessionShape {
    if (!ctx.session) ctx.session = {};
    const s: SessionShape = ctx.session as SessionShape;
    s.path = s.path ?? [];
    s.pathNodes = s.pathNodes ?? [];
    s.state = s.state ?? null;
    s.ticket = s.ticket ?? null;
    s.pendingImages = s.pendingImages ?? [];
    return s;
  }

  private async safeEdit(ctx: any, text: string, extra: any) {
    try {
      return await ctx.editMessageText(text, extra);
    } catch (e) {
      return await ctx.reply(text, extra);
    }
  }

  // pick a decent sized image from telegram photo array
  private async extractBestPhoto(ctx: any, photos: any[]): Promise<Buffer | null> {
    if (!photos || photos.length === 0) return null;
    let best: any = photos[Math.floor(photos.length / 2)];
    try {
      return await this.downloadFileBuffer(ctx, best.file_id);
    } catch (e) {
      this.logger.warn('Failed to extract best photo', e);
      return null;
    }
  }

  private keyboardFor(nodes: any[], includeBack = false, backSlug?: string) {
    const rows = nodes.map((n: any) => [{ text: n.title, callback_data: `menu:${n.slug}` }]);
    if (includeBack) rows.push([{ text: '🔙 Back', callback_data: `back:${backSlug || 'root'}` }]);
    rows.push([{ text: '🏠 Main menu', callback_data: 'back:root' }]);
    return { reply_markup: { inline_keyboard: rows } };
  }

  // returns array of node objects from root to the found node (title,slug,id,children)
  private findPathToSlug(nodes: any[], slug: string, acc: any[] = []): any[] | null {
    for (const node of nodes) {
      const nextAcc = acc.concat([{ title: node.title, slug: node.slug, id: node.id, children: node.children, metadata: node.metadata }]);
      if (node.slug === slug) return nextAcc;
      if (node.children?.length) {
        const found = this.findPathToSlug(node.children, slug, nextAcc);
        if (found) return found;
      }
    }
    return null;
  }

  private renderNodeInfo(node: any): string {
    let out = `*${node.title}*\n\n`;
    if (node.children?.length) {
      out += `Submenus:\n${node.children.map((c: any) => `• ${c.title}`).join('\n')}`;
    } else {
      out += `_No submenus — this is a leaf menu._`;
    }
    return out;
  }

  // download file by file_id -> Buffer (uses global fetch)
  private async downloadFileBuffer(ctx: any, fileId: string): Promise<Buffer | null> {
    try {
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const res = await fetch(fileLink.href);
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    } catch (err) {
      this.logger.warn('downloadFileBuffer error', err);
      return null;
    }
  }

  // --------------------
  // Session timeout & throttling helpers
  // --------------------
  private checkTimeout(session: SessionShape, ctx: any): boolean {
    const now = Date.now();
    if (session.startedAt && now - session.startedAt > this.SESSION_TTL) {
      // expired
      session.state = null;
      session.ticket = null;
      session.path = [];
      session.pathNodes = [];
      session.pendingImages = [];
      session.startedAt = undefined;
      try { ctx.reply('⏳ Your ticket session expired due to inactivity. Please /start and try again.'); } catch {}
      return true;
    }
    return false;
  }

  private checkThrottle(session: SessionShape, ctx: any): boolean {
    const now = Date.now();
  
    // Allow media in active ticket flows to avoid blocking multiple images sent quickly
    const isMediaMessage = !!(ctx.message && (ctx.message.photo || (ctx.message.document && ctx.message.document.mime_type?.startsWith('image'))));
    const inTicketFlow = session.state === 'COLLECTING_FIELDS' || session.state === 'AWAITING_TICKET_MESSAGE';
  
    // If it's a media message AND we're in a ticket flow, skip throttle check
    if (isMediaMessage && inTicketFlow) {
      session.lastMessageTimestamp = Date.now();
      return false;
    }
  
    if (session.lastMessageTimestamp && now - session.lastMessageTimestamp < this.THROTTLE_MS) {
      try { ctx.reply('⚠️ You are sending messages too fast. Please wait a moment.'); } catch {}
      return true;
    }
    session.lastMessageTimestamp = Date.now();
    return false;
  }
  

  // --------------------
  // Field validation
  // --------------------
    private validateField(field: string, value: string): string | null {
        if (!value || String(value).trim().length === 0) {
            // Only truly required fields should trigger this; optional fields can be handled elsewhere
            return null; // allow empty for optional fields
        }

        const v = value.trim();

        switch (field) {
        // ----------------- User Info -----------------
        case 'fullName':
            return v.split(' ').length >= 1 ? null : 'Please provide your full name';
        case 'telegramUsername':
            return v.startsWith('@') ? null : 'Telegram username should start with @';
        case 'email':
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Invalid email format';
        case 'phone':
            return v.replace(/\D/g, '').length >= 7 ? null : 'Phone number looks too short';

        // ----------------- Wallet / blockchain -----------------
        case 'wallet':
            return v.length >= 20 ? null : 'Wallet address looks too short';
        case 'chain':
            return v.length > 0 ? null : 'Blockchain/network cannot be empty';

        // ----------------- Message / description -----------------
        case 'message':
        case 'offerDetails':
            return v.length >= 3 ? null : `${field} must be at least 3 characters`;

        // ----------------- Documents / Images -----------------
        case 'images':
        case 'documents':
            return null; // file validation handled separately (buffer or URL)

        // ----------------- Platform / Social -----------------
        case 'discordUsername':
            // Accept either @username or username#1234 (discriminator can be digits or letters)
            return /^@?[\w]{2,32}(#\w{1,32})?$/.test(v)
                ? null
                : 'Discord username should start with @ or include a valid tag (e.g. Name#1234 or @Name)';
        case 'username':
            return /^[a-zA-Z0-9_]{3,32}$/.test(v) ? null : 'Username must be 3–32 characters, alphanumeric or _';

        // ----------------- Collaboration / Project -----------------
        case 'projectName':
            return v.length >= 2 ? null : 'Project name is too short';
        case 'tier':
            return v.length >= 1 ? null : 'Tier cannot be empty';

        case 'callLink':
        case 'links':
            // accept single or comma-separated URLs
            const urls = v.split(',').map(s => s.trim());
            const invalid = urls.find(u => !/^https?:\/\/\S+$/i.test(u));
            return invalid ? 'Invalid URL format' : null;

        case 'referralId':
            return v.length > 0 ? null : 'Referral ID cannot be empty';

        // ----------------- Admin / system -----------------
        case 'note':
            return null; // free text
        case 'scamAlert':
            return ['true','false','yes','no','1','0'].includes(v.toLowerCase()) ? null : 'Invalid boolean value';
        case 'xpPoints':
            return !isNaN(Number(v)) ? null : 'XP points must be a number';

        default:
            return null; // unknown fields are accepted as free text
        }
    }

    // Format Ticket list
    private formatTicketList(tickets: Ticket[], telegramId?: string): string {
        let text = telegramId
            ? `🎟 *Tickets for user* \`${telegramId}\`:\n\n`
            : `🎟 *Ticket List:*\n\n`;
    
        tickets.forEach((t, i) => {
            const statusEmoji = t.status ? '✅ Closed' : '🟢 Open';
    
            text += `🎫 *Ticket:* \`${t.ticketNumber}\` (${statusEmoji})\n`;
            // Ticket number in a block code box (copyable)
            // text += `🎫 *Ticket:*\n\`\`\`\n${t.ticketNumber}\n\`\`\` ${statusEmoji}\n`;
    
    
            text += `📌 Type: ${t.type}\n`;
            text += `🏷 Tag: ${t.tag}\n`;
    
            // Only display fields that exist
            if (t.fullName) text += `👤 Full Name: ${t.fullName}\n`;
            if (t.telegramUsername) text += `💬 Telegram: ${t.telegramUsername}\n`;
            if (t.email) text += `✉️ Email: ${t.email}\n`;
            if (t.wallet) text += `💰 Wallet: ${t.wallet}\n`;
            if (t.chain) text += `⛓ Chain: ${t.chain}\n`;
            if (t.message) text += `📝 Message: ${t.message}\n`;
            if (t.images?.length) text += `📸 Images: ${t.images.join(', ')}\n`;
            if (t.documents?.length) text += `📄 Documents: ${t.documents.join(', ')}\n`;
            if (t.discordUsername) text += `🎮 Discord: ${t.discordUsername}\n`;
            if (t.username) text += `👤 Username: ${t.username}\n`;
            if (t.referralId) text += `🔗 Referral ID: ${t.referralId}\n`;
            if (t.projectName) text += `🚀 Project: ${t.projectName}\n`;
            if (t.offerDetails) text += `💡 Offer Details: ${t.offerDetails}\n`;
            if (t.links?.length) text += `🔗 Links: ${t.links.join(', ')}\n`;
            if (t.tier) text += `🏆 Tier: ${t.tier}\n`;
            if (t.note) text += `🗒 Note: ${t.note}\n`;
            if (t.callLink) text += `📞 Call Link: ${t.callLink}\n`;
            if (t.scamAlert !== null && t.scamAlert !== undefined) text += `⚠️ Scam Alert: ${t.scamAlert}\n`;
            if (t.xpPoints !== null && t.xpPoints !== undefined) text += `⭐ XP Points: ${t.xpPoints}\n`;
    
            text += `🕒 Created At: ${t.createdAt.toLocaleString()}\n`;
            text += `────────────────────────\n\n`;
        });
    
        return text;
    }

  // --------------------
  // Register handlers
  // --------------------
  private registerHandlers() {
    // START: upsert user, welcome, show main menu
    this.bot.start(async (ctx: any) => {
      try {
        const session = this.ensureSession(ctx);
        session.lastMessageTimestamp = Date.now();
        session.startedAt = undefined;
        await this.usersService.upsertFromTelegram(ctx.from);
        const structure = await this.menusService.getStructure();

        await ctx.reply(`
🤖 Welcome to Fasqon Support! 💚

Hey there! I’m your Fasqon Support Assistant — here to help you with anything related to your account, payments, crypto, cards, mini-app, airdrop, or $FSQN.
Just follow the prompts or tell me what you need help with. ✨

🌍 What Fasqon Is

Fasqon is a next-generation Web3 neobank built in Europe — combining:
• IBAN banking
• Crypto wallets
• Real-time SEPA transfers (€100K limit)
• Crypto ↔ fiat conversion
• AI-powered payment tools
• Virtual + physical crypto cards

Powered by $FSQN, our utility + rewards token.

🚀 Mini-App & Airdrop

Earn $TON & $FSQN by completing missions:
👉 https://t.me/fasqonbot/app

Leaderboard: https://leaderboard.fasqon.com/

💸 $FSQN Private Sale (Live Now)

• –50% discount before listing
• 1,000 $FSQN = $15
👉 https://tokensale.fasqon.com/

🔗 Useful Links

📢 Announcements: https://t.me/fasqonofficial

📄 Docs: https://fasqon.gitbook.io/fasqon-mini-app/

💳 Fasqon Cards: https://t.me/fasqonchat/56660            
            `
, { parse_mode: 'Markdown' });

        if (!structure || structure.length === 0) {
          await ctx.reply('No support menus are available right now. Please try again later.');
          return;
        }
        await ctx.reply('Main Menu:', this.keyboardFor(structure));
      } catch (err) {
        this.logger.error('start handler error', err);
        try { await ctx.reply('An error occurred while starting. Try again later.'); } catch {}
      }
    });

    // connecting with support bot in chat
    this.bot.command('support', async (ctx) => {
        // Only respond in groups
        if (ctx.chat.type === 'private') return;
      
        const botUsername = ctx.me; // support bot username
        const link = `https://t.me/${botUsername}?start=support`;
      
        await ctx.reply(
          `🆘 *Need help?*\n\nTap below to contact Fasqon Support privately.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: '🎫 Contact Support', url: link }
              ]]
            }
          }
        );
      });
      

    // --------------------
    // CALLBACK QUERY: menu navigation & ticket start
    // --------------------
    this.bot.on('callback_query', async (ctx: any) => {
        try {
        const session = this.ensureSession(ctx);
        const data: string = ctx.callbackQuery?.data;
        if (!data) return ctx.answerCbQuery();
    
        if (data.startsWith('menu:')) {
            const slug = data.split(':')[1];
            const structure = await this.menusService.getStructure();
            const pathNodes = this.findPathToSlug(structure, slug);
            if (!pathNodes) return ctx.answerCbQuery('Menu not found.');
    
            session.pathNodes = pathNodes;
            session.path = pathNodes.map(p => p.slug);
    
            const nodeObj = pathNodes[pathNodes.length - 1];
            const fullNode = await this.menusService.findByTitle(nodeObj.title);
    
            const metadata = fullNode?.metadata ?? nodeObj.metadata ?? {};
            const requiredFields: string[] = Array.isArray(metadata.requiredFields) ? metadata.requiredFields : [];
    
            const isCreateTicket = requiredFields.length > 0 || (nodeObj.title || '').toLowerCase().startsWith('create ticket');
    
            if (fullNode.children?.length && !isCreateTicket) {
            const includeBack = pathNodes.length > 1;
            const parentSlug = pathNodes.length > 1 ? pathNodes[pathNodes.length - 2].slug : 'root';
            await this.safeEdit(ctx, `📂 *${fullNode.title}*`, {
                parse_mode: 'Markdown',
                ...this.keyboardFor(fullNode.children, includeBack, parentSlug),
            });
            return ctx.answerCbQuery();
            }
    
            if (isCreateTicket) {
            const type = pathNodes[0]?.title ?? 'support';
            const tag = pathNodes.length >= 2 ? pathNodes[pathNodes.length - 2].title : type;
    
            session.state = 'COLLECTING_FIELDS';
            session.ticket = {
                type,
                tag,
                menuSlug: nodeObj.slug,
                requiredFields,
                collected: {},
                currentStep: 0,
            };
            session.startedAt = Date.now();
            session.pendingImages = [];
    
            if (!requiredFields.length) {
                session.state = 'AWAITING_TICKET_MESSAGE';
                await ctx.reply(`🎫 *Create Ticket — ${type}/${tag}*\nPlease send your issue description (text) and optionally attach images.`, { parse_mode: 'Markdown' });
                return ctx.answerCbQuery();
            }
    
            // Prompt first field
            const first = requiredFields[0];
            await ctx.reply(`🎫 *Create Ticket — ${type}/${tag}*\n\nRequired fields:\n${requiredFields.map(f => `• ${f}`).join('\n')}\n\nPlease enter *${first}*:`, { parse_mode: 'Markdown' });
            return ctx.answerCbQuery();
            }
    
            await ctx.answerCbQuery();
        }
    
        // BACK navigation
        if (data.startsWith('back:')) {
            const target = data.split(':')[1];
            const structure = await this.menusService.getStructure();
            if (!target || target === 'root') {
            session.path = [];
            session.pathNodes = [];
            await this.safeEdit(ctx, 'Main Menu:', this.keyboardFor(structure));
            return ctx.answerCbQuery();
            }
            const pathNodes = this.findPathToSlug(structure, target);
            if (!pathNodes) {
            session.path = [];
            session.pathNodes = [];
            await this.safeEdit(ctx, 'Main Menu:', this.keyboardFor(structure));
            return ctx.answerCbQuery();
            }
            session.pathNodes = pathNodes;
            session.path = pathNodes.map(p => p.slug);
            const nodeObj = pathNodes[pathNodes.length - 1];
            const fullNode = await this.menusService.findByTitle(nodeObj.title);
            const includeBack = pathNodes.length > 1;
            const parentSlug = pathNodes.length > 1 ? pathNodes[pathNodes.length - 2].slug : 'root';
            await this.safeEdit(ctx, `📂 *${fullNode.title}*`, {
            parse_mode: 'Markdown',
            ...this.keyboardFor(fullNode.children ?? [], includeBack, parentSlug),
            });
            return ctx.answerCbQuery();
        }
    
        } catch (err) {
        this.logger.error('callback_query error', err);
        try { await ctx.answerCbQuery('Error occurred'); } catch {}
        }
    });
  
    // --------------------
    // MESSAGE handler: step-by-step field collection & ticket creation
    // --------------------

    // this.bot.on('message', async (ctx: any) => {
    //     // try {
    //         console.log('--- New message received ---');
    //         console.log('Raw message:', ctx.message);
    
    //         const session = this.ensureSession(ctx);
    
    //         // Initialize pendingDocuments buffer if not already
    //         if (!session.pendingDocuments) session.pendingDocuments = [] as PendingDocument[];

    
    //         // --- CONFIRMATION HANDLER ---
    //         if (session.state === 'CONFIRMING_TICKET') {
    //             const text = ctx.message.text?.toLowerCase();
    
    //             if (text === 'yes') {
    //                 console.log('User confirmed ticket creation.');
    
    //                 const collected = session.ticket.collected;
    
    //                 // Upload documents to Cloudinary if any
    //                 // let uploadedDocuments: string[] | undefined = undefined;
    //                 // if (collected['documents']?.length) {
    //                 //     uploadedDocuments = [];
    //                 //     for (const docBuffer of collected['documents']) {
    //                 //         const url = await this.imagesService.uploadFile(docBuffer, 'fasqon-support/tickets/documents');
    //                 //         uploadedDocuments.push(url);
    //                 //     }
    //                 // }
    
    //                 // const files = [collected['images'], collected['documents']];
    //                 const images: Buffer[] = [
    //                     ...(collected['images'] || []),
    //                      // extract the buffer from each doc
    //                     // ...(collected['documents'] || []).map(d => d.buffer))
    //                 ];

    //                 const files: Buffer[] = [
    //                     ...(collected['documents'] || []),
    //                 ]

    //                 console.log("This is the file count before ticket creation", files.length);
    //                 console.log("these are the document files beforeticket creation", collected['documents']);
    //                 console.log("This is the files structure before sending it to the createTicket function", files)
    
    //                 const user = await this.usersService.upsertFromTelegram(ctx.from);
    //                 const ticketNumber = generateUniqueTicketNumber();
    
    //                 const composedMessage = Object.entries(collected)
    //                     .filter(([k]) => k !== 'images' && k !== 'documents')
    //                     .map(([k, v]) => `*${k}:* ${v}`)
    //                     .join('\n');
    
    //                 const createdTicket = await this.ticketsService.createTicket(
    //                     user,
    //                     session.ticket.type,
    //                     ticketNumber,
    //                     session.ticket.tag,
    //                     composedMessage,
    //                     files?.length ? files : undefined,
    //                     images?.length ? images : undefined
    //                 );

    //                 console.log("This is the list of all uploaded files", createdTicket);
                    
    
    //                 await ctx.reply(
    //                     `✅ Ticket created!\n• Ticket Number: \`${ticketNumber}\`\n• Type: *${createdTicket.type}*\n• Tag: *${createdTicket.tag}*`,
    //                     { parse_mode: 'Markdown' }
    //                 );
    
    //                 const structure = await this.menusService.getStructure();
    //                 if (!structure || structure.length === 0) {
    //                     await ctx.reply('No support menus are available right now. Please try again later.');
    //                     return;
    //                 }
    //                 await ctx.reply('Main Menu:', this.keyboardFor(structure));
    
    //                 // Reset session
    //                 session.ticket = null;
    //                 session.pendingImages = [];
    //                 session.pendingDocuments = [];
    //                 session.state = null;
    
    //                 return;
    //             }
    
    //             if (text === 'no') {
    //                 console.log('User canceled ticket.');
    
    //                 await ctx.reply('❌ Ticket creation canceled.');
    
    //                 const structure = await this.menusService.getStructure();
    //                 if (!structure || structure.length === 0) {
    //                     await ctx.reply('No support menus are available right now. Please try again later.');
    //                     return;
    //                 }
    //                 await ctx.reply('Main Menu:', this.keyboardFor(structure));
    
    //                 session.ticket = null;
    //                 session.pendingImages = [];
    //                 session.pendingDocuments = [];
    //                 session.state = null;
    
    //                 return;
    //             }
    
    //             return ctx.reply('⚠️ Please reply YES or NO.');
    //         }
    
    //         if (!session.ticket || session.state !== 'COLLECTING_FIELDS') {
    //             console.log('No active ticket in COLLECTING_FIELDS state. Exiting.');
    //             return;
    //         }
    
    //         const step = session.ticket.currentStep;
    //         const fields = session.ticket.requiredFields;
    //         const field = fields[step];
    
    //         if (!field) return;
    
    //         const messageText = ctx.message.text || null;
    //         const photos = ctx.message.photo || [];
    //         const document = ctx.message.document || null;
    
    //         console.log('Current step:', step);
    //         console.log('Field to collect:', field);
    //         console.log('Message text:', messageText);
    //         console.log('Photos received:', photos.length);
    //         console.log('Document received:', !!document);
    
    //         // ----------------------------------------
    //         // --- IMAGE FIELD ---
    //         // ----------------------------------------
    //         if (field === 'images') {
    //             if (!session.pendingImages) session.pendingImages = [];
    
    //             if (photos.length > 0) {
    //                 console.log('Photo(s) detected, downloading buffers...');
    //                 const largestPhoto = photos[photos.length - 1];
    //                 const buffer = await downloadFileBuffer(ctx, largestPhoto.file_id);
    //                 if (!Buffer.isBuffer(buffer)) {
    //                     return ctx.reply('⚠️ Invalid image. Please send again.');
    //                 }
    //                 session.pendingImages.push(buffer);
    //                 console.log('Pending images count:', session.pendingImages.length);
    //                 return ctx.reply(`📸 Photo added ✅ Total images: ${session.pendingImages.length}`);
    //             }
    
    //             if (messageText?.toLowerCase() === 'done') {
    //                 if (!session.pendingImages || session.pendingImages.length === 0) {
    //                     return ctx.reply('⚠️ You need to send at least one image before typing "done".');
    //                 }
    
    //                 // Save images
    //                 session.ticket.collected['images'] = session.pendingImages.slice();
    //                 session.pendingImages = [];
    //                 session.ticket.currentStep++;
    //                 console.log('All images received. Moving to next field.');
    
    //                 // IF IMAGES ARE THE LAST FIELD → CONFIRMATION
    //                 if (session.ticket.currentStep >= fields.length) {
    //                     session.state = 'CONFIRMING_TICKET';
    
    //                     const collected = session.ticket.collected;
    
    //                     const preview = Object.entries(collected)
    //                         .filter(([k]) => k !== 'images' && k !== 'documents')
    //                         .map(([k, v]) => `*${k}:* ${v}`)
    //                         .join('\n');
    
    //                     await ctx.reply(
    //                         `📝 *Please confirm your ticket details:*\n\n${preview}\n\n📸 Images: ${collected['images']?.length || 0}\n\n*Create ticket?* Reply with:\n➡️ YES\n➡️ NO`,
    //                         { parse_mode: 'Markdown' }
    //                     );
    
    //                     return;
    //                 }
    
    //                 await ctx.reply('✅ All images received.');
    //                 return;
    //             }
    
    //             return ctx.reply('📸 Please send images. When done, type "done".');
    //         }
    
    //         // ----------------------------------------
    //         // --- DOCUMENT FIELD ---
    //         // ----------------------------------------
    //         // if (field === 'documents') {
    //         //     if (!session.pendingDocuments) session.pendingDocuments = [];
    
    //         //     if (document) {
    //         //         // Accept only PDF, TXT, CSV, DOCX
    //         //         const allowedTypes = ['application/pdf', 'text/plain', 'text/csv', 
    //         //                               'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    //         //         if (!allowedTypes.includes(document.mime_type)) {
    //         //             return ctx.reply('⚠️ Unsupported document type. Allowed: PDF, TXT, CSV, DOCX.');
    //         //         }
    
    //         //         console.log('Document detected, downloading buffer...');
    //         //         const buffer = await downloadFileBuffer(ctx, document.file_id);
    //         //         if (!Buffer.isBuffer(buffer)) {
    //         //             return ctx.reply('⚠️ Invalid document. Please send again.');
    //         //         }
    
    //         //         session.pendingDocuments.push(buffer);
    //         //         console.log('Pending documents count:', session.pendingDocuments.length);
    //         //         return ctx.reply(`📄 Document added ✅ Total documents: ${session.pendingDocuments.length}`);
    //         //     }
    
    //         //     if (messageText?.toLowerCase() === 'done') {
    //         //         if (!session.pendingDocuments || session.pendingDocuments.length === 0) {
    //         //             return ctx.reply('⚠️ You need to send at least one document before typing "done".');
    //         //         }
    
    //         //         // Save documents
    //         //         session.ticket.collected['documents'] = session.pendingDocuments.slice();
    //         //         session.pendingDocuments = [];
    //         //         session.ticket.currentStep++;
    //         //         console.log('All documents received. Moving to next field.');
    
    //         //         // IF DOCUMENTS ARE THE LAST FIELD → CONFIRMATION
    //         //         if (session.ticket.currentStep >= fields.length) {
    //         //             session.state = 'CONFIRMING_TICKET';
    
    //         //             const collected = session.ticket.collected;
    
    //         //             const preview = Object.entries(collected)
    //         //                 .filter(([k]) => k !== 'images' && k !== 'documents')
    //         //                 .map(([k, v]) => `*${k}:* ${v}`)
    //         //                 .join('\n');
    
    //         //             await ctx.reply(
    //         //                 `📝 *Please confirm your ticket details:*\n\n${preview}\n\n📄 Documents: ${collected['documents']?.length || 0}\n\n*Create ticket?* Reply with:\n➡️ YES\n➡️ NO`,
    //         //                 { parse_mode: 'Markdown' }
    //         //             );
    
    //         //             return;
    //         //         }
    
    //         //         await ctx.reply('✅ All documents received.');
    //         //         return;
    //         //     }
    
    //         //     return ctx.reply('📄 Please send documents. When done, type "done".');
    //         // }

    //         // ----------------------------------------
    //         // --- DOCUMENT FIELD ---
    //         // ----------------------------------------
    //         if (field === 'documents') {
    //             if (!session.pendingDocuments) session.pendingDocuments = [];

    //             // If a new document is sent
    //             if (document) {
    //                 // Accept only PDF, TXT, CSV, DOCX
    //                 const allowedTypes = [
    //                     'application/pdf',
    //                     'text/plain',
    //                     'text/csv',
    //                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    //                 ];

    //                 if (!allowedTypes.includes(document.mime_type)) {
    //                     return ctx.reply(
    //                         '⚠️ Unsupported document type. Allowed: PDF, TXT, CSV, DOCX.'
    //                     );
    //                 }

    //                 console.log('Document detected, downloading buffer...');
    //                 const buffer = await downloadFileBuffer(ctx, document.file_id);
    //                 if (!Buffer.isBuffer(buffer)) {
    //                     return ctx.reply('⚠️ Invalid document. Please send again.');
    //                 }

    //                 session.pendingDocuments.push({
    //                     fileName: document.file_name,
    //                     mimeType: document.mime_type,
    //                     buffer
    //                 });

    //                 console.log('Pending documents count:', session.pendingDocuments.length);
    //                 return ctx.reply(
    //                     `📄 Document added ✅ Total documents: ${session.pendingDocuments.length}`
    //                 );
    //             } // <-- CLOSE if (document) block here

    //             // Move to next field when user types 'done'
    //             if (messageText?.toLowerCase() === 'done') {
    //                 if (!session.pendingDocuments || session.pendingDocuments.length === 0) {
    //                     return ctx.reply(
    //                         '⚠️ You need to send at least one document before typing "done".'
    //                     );
    //                 }

    //                 // Save documents into ticket collected data
    //                 session.ticket.collected['documents'] = session.pendingDocuments.slice();
    //                 session.pendingDocuments = [];
    //                 session.ticket.currentStep++;
    //                 console.log('All documents received. Moving to next field.');

    //                 // IF DOCUMENTS ARE THE LAST FIELD → CONFIRMATION
    //                 if (session.ticket.currentStep >= fields.length) {
    //                     session.state = 'CONFIRMING_TICKET';

    //                     const collected = session.ticket.collected;

    //                     const preview = Object.entries(collected)
    //                         .filter(([k]) => k !== 'images' && k !== 'documents')
    //                         .map(([k, v]) => `*${k}:* ${v}`)
    //                         .join('\n');

    //                     await ctx.reply(
    //                         `📝 *Please confirm your ticket details:*\n\n${preview}\n\n📄 Documents: ${collected['documents']?.length || 0}\n\n*Create ticket?* Reply with:\n➡️ YES\n➡️ NO`,
    //                         { parse_mode: 'Markdown' }
    //                     );

    //                     return;
    //                 }

    //                 return ctx.reply('✅ All documents received.');
    //             }

    //             return ctx.reply('📄 Please send documents. When done, type "done".');
    //         }

    
    //         // ----------------------------------------
    //         // --- TEXT FIELD ---
    //         // ----------------------------------------
    //         if (messageText) {
    //             console.log(`Collecting text for field "${field}":`, messageText);
    //             session.ticket.collected[field] = messageText;
    //             session.ticket.currentStep++;
    
    //             // IF TEXT FIELD IS LAST FIELD → CONFIRMATION
    //             if (session.ticket.currentStep >= fields.length) {
    //                 session.state = 'CONFIRMING_TICKET';
    
    //                 const collected = session.ticket.collected;
    
    //                 const preview = Object.entries(collected)
    //                     .filter(([k]) => k !== 'images' && k !== 'documents')
    //                     .map(([k, v]) => `*${k}:* ${v}`)
    //                     .join('\n');
    
    //                 await ctx.reply(
    //                     `📝 *Please confirm your ticket details:*\n\n${preview}\n\n📸 Images: ${collected['images']?.length || 0}\n📄 Documents: ${collected['documents']?.length || 0}\n\n*Create ticket?* Reply with:\n➡️ YES\n➡️ NO`,
    //                     { parse_mode: 'Markdown' }
    //                 );
    
    //                 return;
    //             }
    
    //             return;
    //         }
    
    //     // } catch (err) {
    //     //     console.error('Message handler error:', err);
    //     //     await ctx.reply('⚠️ An unexpected error occurred. Please try again.');
    //     // }
    // });

    this.bot.on('message', async (ctx: any) => {
        console.log('--- New message received ---');
        console.log('Raw message:', ctx.message);
    
        const session = this.ensureSession(ctx);
    
        if (!session.pendingDocuments) session.pendingDocuments = [] as PendingDocument[];
    
        // --- CONFIRMATION HANDLER ---
        if (session.state === 'CONFIRMING_TICKET') {
            const text = ctx.message.text?.toLowerCase();

            // if (text === 'yes') {
            //     console.log('User confirmed ticket creation.');
            //     const collected = session.ticket.collected;
            //     console.log('Collected data:', collected);
            
            //     const images: Buffer[] = [...(collected['images'] || [])];
            //     const files: Buffer[] = [...(collected['documents'] || [])];
            
            //     const user = await this.usersService.upsertFromTelegram(ctx.from);
            //     const ticketNumber = generateUniqueTicketNumber();
            
            //     // Notify user that the ticket is being forwarded
            //     await ctx.reply('📤 Forwarding your ticket to our support team. Please wait…');
            
            //     // Optional: add a small delay for UX
            //     await new Promise((res) => setTimeout(res, 500));
            
            //     const createdTicket = await this.ticketsService.createTicket(
            //         user,
            //         session.ticket.type,
            //         ticketNumber,
            //         session.ticket.tag,
            //         collected,
            //         files?.length ? files : undefined,
            //         images?.length ? images : undefined
            //     );
            
            //     // Build Telegram message for support team
            //     const supportChatId = process.env.SUPPORT_GROUP_ID;
            //     const tgMessage = this.formatTicketList([createdTicket], createdTicket.user.telegramId)
            
            //     // Send ticket to support Telegram group
            //     await ctx.telegram.sendMessage(supportChatId, tgMessage, { parse_mode: "Markdown" });
            
            //     // Forward ticket to support email
            //     const emailHtml = buildTicketEmailHtml(createdTicket);
            //     await this.mailService.sendSupportEmail(
            //         process.env.SUPPORT_EMAIL,
            //         `New Support Ticket - ${createdTicket.ticketNumber}`,
            //         `Ticket number: ${createdTicket.ticketNumber}`,
            //         emailHtml
            //     );
            
            //     // Inform user that forwarding is complete
            //     await ctx.reply('✅ Your ticket has been successfully forwarded to our support team.');
            
            //     // Show ticket summary to user
            //     let userMessage = `🎫 *Ticket Created!*\n\n`;
            //     userMessage += `*Ticket Number:* \`${ticketNumber}\`\n`;
            //     userMessage += `*Type:* ${createdTicket.type}\n`;
            //     userMessage += `*Tag:* ${createdTicket.tag}\n`;
            //     userMessage += `*Created:* ${createdTicket.createdAt.toUTCString()}\n\n`;
            //     userMessage += `You will be contacted by our support team soon.`;
            
            //     await ctx.reply(userMessage, { parse_mode: 'Markdown' });
            
            //     // Show main menu
            //     const structure = await this.menusService.getStructure();
            //     if (!structure || structure.length === 0) {
            //         await ctx.reply('No support menus are available right now. Please try again later.');
            //         return;
            //     }
            //     await ctx.reply('Main Menu:', this.keyboardFor(structure));
            
            //     // Reset session
            //     session.ticket = null;
            //     session.pendingImages = [];
            //     session.pendingDocuments = [];
            //     session.state = null;
            
            //     return;
            // }

            if (text === 'yes') {
                console.log('User confirmed ticket creation.');
                const collected = session.ticket.collected;
                console.log('Collected data:', collected);
            
                const images: Buffer[] = [...(collected['images'] || [])];
                const files: Buffer[] = [...(collected['documents'] || [])];
            
                const user = await this.usersService.upsertFromTelegram(ctx.from);
                const ticketNumber = generateUniqueTicketNumber();
            
                // Notify user that the ticket is being forwarded
                await ctx.reply('📤 Forwarding your ticket to our support team. Please wait…');
            
                // Optional: small delay for UX
                await new Promise((res) => setTimeout(res, 500));
            
                const createdTicket = await this.ticketsService.createTicket(
                    user,
                    session.ticket.type,
                    ticketNumber,
                    session.ticket.tag,
                    collected,
                    files?.length ? files : undefined,
                    images?.length ? images : undefined
                );
            
                // ---- EMAIL ATTEMPT (non-blocking, timed) ----
                const emailHtml = buildTicketEmailHtml(createdTicket);

                const emailSent = await this.mailService.sendSupportEmail(
                    process.env.SUPPORT_EMAIL,
                    `New Support Ticket - ${createdTicket.ticketNumber}`,
                    `Ticket number: ${createdTicket.ticketNumber}`,
                    emailHtml,
                    3000, // timeout
                );

            
                // Only send to Telegram if email failed
                if (!emailSent) {
                    const supportChatId = process.env.SUPPORT_GROUP_ID;
                    const tgMessage = this.formatTicketList([createdTicket], createdTicket.user.telegramId);
            
                    try {
                        await ctx.telegram.sendMessage(supportChatId, tgMessage, { parse_mode: "Markdown" });
                        console.log('✅ Ticket forwarded to Telegram support group because email failed.');
                    } catch (tgErr) {
                        console.error('❌ Failed to forward ticket to Telegram group:', tgErr);
                    }
                }
            
                // Inform user that forwarding is complete
                await ctx.reply('✅ Your ticket has been successfully forwarded to our support team.');
            
                // Show ticket summary to user
                let userMessage = `🎫 *Ticket Created!*\n\n`;
                userMessage += `*Ticket Number:* \`${ticketNumber}\`\n`;
                userMessage += `*Type:* ${createdTicket.type}\n`;
                userMessage += `*Tag:* ${createdTicket.tag}\n`;
                userMessage += `*Created:* ${createdTicket.createdAt.toUTCString()}\n\n`;
                userMessage += `You will be contacted by our support team soon.`;
            
                await ctx.reply(userMessage, { parse_mode: 'Markdown' });
            
                // Show main menu
                const structure = await this.menusService.getStructure();
                if (!structure || structure.length === 0) {
                    await ctx.reply('No support menus are available right now. Please try again later.');
                    return;
                }
                await ctx.reply('Main Menu:', this.keyboardFor(structure));
            
                // Reset session
                session.ticket = null;
                session.pendingImages = [];
                session.pendingDocuments = [];
                session.state = null;
            
                return;
            }
            
            
    
            if (text === 'no') {
                console.log('User canceled ticket.');
                await ctx.reply('❌ Ticket creation canceled.');
    
                const structure = await this.menusService.getStructure();
                if (!structure || structure.length === 0) {
                    await ctx.reply('No support menus are available right now. Please try again later.');
                    return;
                }
                await ctx.reply('Main Menu:', this.keyboardFor(structure));
    
                session.ticket = null;
                session.pendingImages = [];
                session.pendingDocuments = [];
                session.state = null;
    
                return;
            }
    
            return ctx.reply('⚠️ Please reply YES or NO.');
        }
    
        if (!session.ticket || session.state !== 'COLLECTING_FIELDS') {
            console.log('No active ticket in COLLECTING_FIELDS state. Exiting.');
            return;
        }
    
        const step = session.ticket.currentStep;
        const fields = session.ticket.requiredFields;
        const field = fields[step];
    
        if (!field) return;
    
        const messageText = ctx.message.text || null;
        const photos = ctx.message.photo || [];
        const document = ctx.message.document || null;
    
        console.log('Current step:', step);
        console.log('Field to collect:', field);
        console.log('Message text:', messageText);
        console.log('Photos received:', photos.length);
        console.log('Document received:', !!document);
    
        // ----------------------------------------
        // --- IMAGE FIELD ---
        // ----------------------------------------
        if (field === 'images') {
            if (!session.pendingImages) session.pendingImages = [];
    
            if (photos.length > 0) {
                const largestPhoto = photos[photos.length - 1];
                const buffer = await downloadFileBuffer(ctx, largestPhoto.file_id);
                if (!Buffer.isBuffer(buffer)) {
                    return ctx.reply('⚠️ Invalid image. Please send again.');
                }
                session.pendingImages.push(buffer);
                console.log('Pending images count:', session.pendingImages.length);
                return ctx.reply(`📸 Photo added ✅ Total images: ${session.pendingImages.length}\nSend more or type "done" to finish this step.`);
            }
    
            if (messageText?.toLowerCase() === 'done') {
                if (!session.pendingImages || session.pendingImages.length === 0) {
                    return ctx.reply('⚠️ You need to send at least one image before typing "done".');
                }
                session.ticket.collected['images'] = session.pendingImages.slice();
                session.pendingImages = [];
                session.ticket.currentStep++;
                console.log('All images received. Moving to next field.');
    
                if (session.ticket.currentStep >= fields.length) {
                    session.state = 'CONFIRMING_TICKET';
                    const collected = session.ticket.collected;
                    const preview = Object.entries(collected)
                        .filter(([k]) => k !== 'images' && k !== 'documents')
                        .map(([k, v]) => `*${k}:* ${v}`)
                        .join('\n');
    
                    return ctx.reply(
                        `📝 *Please confirm your ticket details:*\n\n${preview}\n\n📸 Images: ${collected['images']?.length || 0}\n\n*Create ticket?* Reply with:\n➡️ YES\n➡️ NO`,
                        { parse_mode: 'Markdown' }
                    );
                }
                const nextField = fields[session.ticket.currentStep];
                return ctx.reply(`✅ All images received. Proceeding to ${nextField} field.`);
            }
    
            return ctx.reply('📸 Please send images. When done, type "done".');
        }
    
        // ----------------------------------------
        // --- DOCUMENT FIELD ---
        // ----------------------------------------
        if (field === 'documents') {
            if (!session.pendingDocuments) session.pendingDocuments = [];
    
            if (document) {
                const allowedTypes = [
                    'application/pdf',
                    'text/plain',
                    'text/csv',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                ];
                if (!allowedTypes.includes(document.mime_type)) {
                    return ctx.reply('⚠️ Unsupported document type. Allowed: PDF, TXT, CSV, DOCX.');
                }
    
                const buffer = await downloadFileBuffer(ctx, document.file_id);
                if (!Buffer.isBuffer(buffer)) {
                    return ctx.reply('⚠️ Invalid document. Please send again.');
                }
    
                session.pendingDocuments.push({
                    fileName: document.file_name,
                    mimeType: document.mime_type,
                    buffer
                });
    
                console.log('Pending documents count:', session.pendingDocuments.length);
                return ctx.reply(`📄 Document added ✅ Total documents: ${session.pendingDocuments.length}\nSend more or type "done" to finish this step.`);
            }
    
            if (messageText?.toLowerCase() === 'done') {
                if (!session.pendingDocuments || session.pendingDocuments.length === 0) {
                    return ctx.reply('⚠️ You need to send at least one document before typing "done".');
                }
                session.ticket.collected['documents'] = session.pendingDocuments.slice();
                session.pendingDocuments = [];
                session.ticket.currentStep++;
                console.log('All documents received. Moving to next field.');
    
                if (session.ticket.currentStep >= fields.length) {
                    session.state = 'CONFIRMING_TICKET';
                    const collected = session.ticket.collected;
                    const preview = Object.entries(collected)
                        .filter(([k]) => k !== 'images' && k !== 'documents')
                        .map(([k, v]) => `*${k}:* ${v}`)
                        .join('\n');
    
                    return ctx.reply(
                        `📝 *Please confirm your ticket details:*\n\n${preview}\n\n📄 Documents: ${collected['documents']?.length || 0}\n\n*Create ticket?* Reply with:\n➡️ YES\n➡️ NO`,
                        { parse_mode: 'Markdown' }
                    );
                }
                const nextField = fields[session.ticket.currentStep];
                return ctx.reply(`✅ All documents received. Proceeding to ${nextField} field.`);
            }
    
            return ctx.reply('📄 Please send documents. When done, type "done".');
        }
    
        // ----------------------------------------
        // --- TEXT FIELD ---
        // ----------------------------------------
        if (messageText) {
            const error = this.validateField(field, messageText);
            if (error) {
                return ctx.reply(`⚠️ Invalid input: ${error}\nPlease try again for *${field}*.`);
            }
    
            session.ticket.collected[field] = messageText;
            session.ticket.currentStep++;
            console.log(`Field "${field}" collected:`, messageText);
    
            if (session.ticket.currentStep >= fields.length) {
                session.state = 'CONFIRMING_TICKET';
                const collected = session.ticket.collected;
                const preview = Object.entries(collected)
                    .filter(([k]) => k !== 'images' && k !== 'documents')
                    .map(([k, v]) => `*${k}:* ${v}`)
                    .join('\n');
    
                return ctx.reply(
                    `📝 *Please confirm your ticket details:*\n\n${preview}\n\n📸 Images: ${collected['images']?.length || 0}\n📄 Documents: ${collected['documents']?.length || 0}\n\n*Create ticket?* Reply with:\n➡️ YES\n➡️ NO`,
                    { parse_mode: 'Markdown' }
                );
            }
    
            const nextField = fields[session.ticket.currentStep];
            if (nextField === "images") {
                return ctx.reply(`
✅ Field "${field}" recorded. Next, please provide ${nextField}.
Please upload all required images or screenshots. Please make sure the image uploads to telegram successfully, after that make sure to type *\`"done"\`*
                `);
            } else if (nextField === "documents") {
                return ctx.reply(`
✅ Field "${field}" recorded. Next, please provide ${nextField}.
Please upload all required documents (pdf, docx, txt, csv e.t.c). Please make sure the image uploads to telegram successfully, after that make sure to type *\`"done"\`*
                `);
            } else {
                return ctx.reply(`✅ Field "${field}" recorded. Next, please provide ${nextField}.`);
            }
        }
    });
    
    
   
    async function downloadFileBuffer(ctx: any, fileId: string): Promise<Buffer> {
        try {
        const fileLink = await ctx.telegram.getFileLink(fileId);
        const res = await fetch(fileLink.href);
        if (!res.ok) throw new Error('Failed to download file');
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
        } catch (err) {
        console.error('Failed to download Telegram file:', err);
        throw new Error('Failed to download file');
        }
    }
  
  
  }
}
