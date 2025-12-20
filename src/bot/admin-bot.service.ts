import { Injectable, Logger } from '@nestjs/common';
import { validate as isUUID } from 'uuid';
import { InjectBot } from 'nestjs-telegraf';
import { MenusService } from 'src/modules/menus/menus.service';
import { TicketsService } from 'src/modules/tickets/tickets.service';
import { UsersService } from 'src/modules/users/users.service';
import { Telegraf } from 'telegraf';
import { Ticket } from 'src/modules/tickets/ticket.entity/ticket.entity';
import { formatTicketLists } from 'src/common/utils/helper-functions';

@Injectable()
export class AdminBotService {
  private logger = new Logger('AdminBot');

  constructor(
    @InjectBot('ADMIN_BOT')
    private bot: Telegraf,
    private usersService: UsersService,
    private menusService: MenusService,
    private ticketsService: TicketsService,
  ) {
    this.registerCommands();
  }

  private async isAdmin(ctx: any): Promise<boolean> {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return false;
  
    const user = await this.usersService.findByTelegramId(telegramId);
    if (!user) return false;
  
    return !!user.isAdmin; // true if the column is true
  }

  // Store pending confirmations: key = adminTelegramId, value = menuId
  private pendingDeletes = new Map<string, string>();

  // --------------------------------------
  // UTIL: Pretty Tree Formatter
  // --------------------------------------
  private formatTree(nodes: any[], prefix = ''): string {
    let out = '';
    for (let i = 0; i < nodes.length; i++) {
      const isLast = i === nodes.length - 1;
      const branch = isLast ? '└─ ' : '├─ ';

      out += `${prefix}${branch}*${nodes[i].title}* \n \`${nodes[i].id}\`\n`;

      if (nodes[i].children?.length) {
        const childPrefix = prefix + (isLast ? '   ' : '│  ');
        out += this.formatTree(nodes[i].children, childPrefix);
      }
    }
    return out;
  }

  // Helper function → prevents "message too long" errors
  private async replyInChunks(ctx, text: string, chunkSize = 4000) {
    for (let i = 0; i < text.length; i += chunkSize) {
      await ctx.reply(text.slice(i, i + chunkSize), { parse_mode: "Markdown" });
    }
  }

  private formatTicketList(tickets: Ticket[], telegramId?: string): string {
    let text = telegramId
        ? `🎟 *Tickets for user* ${telegramId}:\n\n`
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

  

  private registerCommands() {

    // =========================
    // WELCOME MESSAGE
    // =========================
    this.bot.start(async (ctx) => {
      const from = ctx.from;
      if (!from?.id) {
        return ctx.reply('❌ Unable to identify user.');
      }
    
      const telegramId = from.id.toString();
    
      // Always upsert the user first
      let user = await this.usersService.upsertFromTelegram(from);
    
      // Check if any admin exists in the system
      const adminExists = await this.usersService.adminExists();
    
      /**
       * BOOTSTRAP LOGIC
       * --------------------------------------------------
       * If no admin exists yet, promote the first user
       */
      if (!adminExists) {
        user.isAdmin = true;
        user = await this.usersService.save(user);
    
        await ctx.reply(
          `
    🚀 *System Bootstrap Complete*
    
    You are now the *first administrator* of the Fasqon system.
    
    🔐 This happens only once — when the database has no admins.
    From now on, only approved admins can access this bot.
    
    Welcome, Commander. 👑
          `,
          { parse_mode: 'Markdown' },
        );
    
        return;
      }
    
      /**
       * NORMAL AUTH FLOW
       * --------------------------------------------------
       * Admins only beyond this point
       */
      if (!user.isAdmin) {
        return ctx.reply('❌ You are not authorized to use this bot.');
      }
    
      const username = user.username || 'Admin';
    
      await ctx.reply(
        `
    🌟 *Welcome aboard, Commander ${username}!*  
    
    You've just logged into the *Fasqon Admin Control Deck* —  
    where buttons are shiny, menus behave (most of the time),  
    and users pretend they read instructions before opening tickets.
    
    🛠 *Your mission:*  
    Keep the ecosystem running smoothly,  
    slap bugs out of existence,  
    and restore peace whenever someone “accidentally” loses their wallet key.
    
    📚 Need guidance?  
    Type */help* to view available admin commands.
    
    🔐 *Authenticated as:* \`${username}\`  
    System online. Let’s work. ⚡
        `,
        { parse_mode: 'Markdown' },
      );
    });
    
      
      

    // =========================
    // HELP MENU
    // =========================
    this.bot.command('help', async (ctx) => {
      // if (!this.isAdmin(ctx)) return ctx.reply('Unauthorized');
      if (!(await this.isAdmin(ctx))) return ctx.reply('❌ You are not authorized to use this bot.');

      const helpText = `
📘 *Fasqon Admin Command Guide*

Welcome to your Fasqon Admin Console!  
This guide explains all commands you can use and how to use them.  

━━━━━━━━━━━━━━━━━━
📂 *Menu Management*
━━━━━━━━━━━━━━━━━━
• */addmenu <parent|null> <title>*  
Create a new menu or submenu.  
- parent: The parent menu title under which this menu should appear, or 'null' for a top-level menu.  
- title: The name of the new menu.  

_Examples:_  
\`/addmenu null Support\` → Creates a top-level menu "Support"  
\`/addmenu Support Billing\` → Creates a submenu "Billing" under "Support"

• */listmenus*  
Shows the full menu structure in a readable tree format.

• */menu <title>*  
View a single menu and all its submenus.  
- title: The exact name of the menu to view.
`;

      const helpText2 = `
• */editmenu <title|uuid> <new title>*  
Change the name of a menu.  
- title|uuid: Either the menu's current name or its unique ID.  
- new title: The new name for the menu.

• */deletemenu <id|title>*  
Delete a menu. If the menu has submenus with active tickets, it will warn you.  
- id|title: Either the menu ID or its full name.  
- The bot will ask for confirmation before deleting. Reply YES or NO.
━━━━━━━━━━━━━━━━━━
🎟 *Ticket creation*
━━━━━━━━━━━━━━━━━━
• */create_ticket_menu <parentTitle|null> <field1,field2,...>*  
Automatically creates a "Create Ticket" menu with a guided submenu that tells users what to fill in.  
- parentTitle: The parent menu to attach this under, or 'null' for top-level.  
- field1,field2,... : Comma-separated fields the user must fill when creating a ticket.

*Available Fields and What They Mean:*
• fullName — Your full name  
• telegramUsername — Telegram username or phone number  
• email — Your email address  
• wallet — Wallet address  
• chain — Blockchain / Network (optional)  
• discordUsername — Discord username  
• username — Username for mini-app / airdrop  
• referralId — Referral ID (optional)  
• projectName — Project or collaboration name  
• offerDetails — Collaboration or offer details  
• tier — Partnership tier  
• message — Describe your problem in detail  
• images — Screenshots or images (optional)  
• documents — Documents (optional)  
• callLink — Calendly or meeting link (optional)  
• note — Internal comment (admin-only)  
• scamAlert — Mark as a scam alert  
• xpPoints — XP / leaderboard points

_Example:_  
\`/create_ticket_menu Discord Role fullName,telegramUsername,email,wallet,discordUsername,message,images\`
`;

      const helpText3 = `
━━━━━━━━━━━━━━━━━━
👥 *User Management*
━━━━━━━━━━━━━━━━━━
• */listusers*  
Show all registered users.

• */user <telegramId>*  
Show details of a specific user.  
- telegramId: The user's Telegram ID.

• */addadmin <telegramId>*  
Make a user an admin.  
- telegramId: The user's Telegram ID.

• */removeadmin <telegramId>*  
Remove admin privileges from a user.  
- telegramId: The user's Telegram ID.
`;

      const helpText4 = `
━━━━━━━━━━━━━━━━━━
🎟 *Ticket Management*
━━━━━━━━━━━━━━━━━━
• */ticket <ticketId|ticketNumber> [open|close]*  
View or update a ticket.  
- ticketId|ticketNumber: Either the internal ID or the public ticket number.  
- open|close (optional): Change the ticket status to open or closed.

_Examples:_  
\`/ticket FSQN-12345\` → View ticket  
\`/ticket FSQN-12345 close\` → Close ticket  

• */listtickets [telegramId|filters]*  
View tickets with optional filters.  

Options:  
- telegramId → List all tickets for that user.  
- type:<type> → Filter by ticket type (e.g., Discord, Whitelist, Airdrop).  
- tag:<tag> → Filter by ticket tag (e.g., Role, XP).  
- ticket:<ticketNumber> → Filter by ticket number.  
- wallet:<walletAddress> → Filter by wallet used.  
- status:<open|closed> → Filter by ticket status.  

_Examples:_  
\`/listtickets\` → Dashboard summary  
\`/listtickets 123456789\` → Tickets for user with Telegram ID 123456789  
\`/listtickets type:Discord status:open\` → Open tickets of type Discord
`;

      const helpText5 = `
• */exporttickets [filters]*  
Export tickets to Excel. Filters are optional.  
- type=<type>  
- tag=<tag>  
- status=<open|closed>  
- userId=<telegramId>  
- createdAt=<YYYY-MM-DD> (optional)

_Example:_  
\`/exporttickets type=Discord tag=Role status=open userId=2382332\`

• */exportticketshelp*  
Shows detailed instructions for exporting tickets.
`;

      const helpText6 = `
━━━━━━━━━━━━━━━━━━
🧩 *Property Inspector*
━━━━━━━━━━━━━━━━━━
• */get <user|ticket|menu> <id> <property>*  
Fetch any property from a user, ticket, or menu.  
- user|ticket|menu → Entity type  
- id → Telegram ID for user, ticket ID for ticket, or menu title for menu  
- property → Property to view (e.g., username, message, title)

_Example:_  
\`/get user 123456789 username\` → Shows the username of that user

━━━━━━━━━━━━━━━━━━
📌 Need help?  
Contact 𝔻𝕒𝕞𝕚𝕒𝕟 (@fortuneCodeHub12), your Fasqon Support System Administrator.
`;

      // Send in chunks
      const chunks = [helpText, helpText2, helpText3, helpText4, helpText5, helpText6];
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "Markdown" });
      }
    });


  

    // =========================
    // ADMIN MANAGEMENT
    // =========================
    // =========================
    // ADD ADMIN
    // =========================
    this.bot.command('addadmin', async (ctx) => {
      if (!(await this.isAdmin(ctx))) {
        return ctx.reply("❌ You are not authorized to perform this action.");
      }

      const telegramId = ctx.message.text.split(' ')[1];
      if (!telegramId) return ctx.reply("Usage: /addadmin <telegramId>");

      try {
        const user = await this.usersService.findByTelegramId(telegramId);
        if (!user) return ctx.reply("User not found.");

        user.isAdmin = true;
        await this.usersService.save(user); 
        await ctx.reply(`✅ User ${user.username || telegramId} is now an admin.`);
      } catch (err: any) {
        await ctx.reply(`❌ Error: ${err.message}`);
      }
    });

    // =========================
    // REMOVE ADMIN
    // =========================
    this.bot.command('removeadmin', async (ctx) => {
      if (!(await this.isAdmin(ctx))) {
        return ctx.reply("❌ You are not authorized to perform this action.");
      }

      const telegramId = ctx.message.text.split(' ')[1];
      if (!telegramId) return ctx.reply("Usage: /removeadmin <telegramId>");

      try {
        const user = await this.usersService.findByTelegramId(telegramId);
        if (!user) return ctx.reply("User not found.");

        user.isAdmin = false;
        await this.usersService.save(user);
        await ctx.reply(`✅ User ${user.username || telegramId} is no longer an admin.`);
      } catch (err: any) {
        await ctx.reply(`❌ Error: ${err.message}`);
      }
    });

      

    // =========================
    // LIST MENUS (pretty tree)
    // =========================
    this.bot.command('listmenus', async (ctx) => {
        // if (!this.isAdmin(ctx)) return ctx.reply('Unauthorized');
        if (!(await this.isAdmin(ctx))) return ctx.reply('❌ You are not authorized to use this bot.');
      const structure = await this.menusService.getStructure();
      const tree = this.formatTree(structure);

      const output = `📂 *Menu Structure*\n${tree}`
      return this.replyInChunks(ctx, output); // << SAFE
    });

    // =========================
    // VIEW ONE MENU
    // =========================
    this.bot.command('menu', async (ctx) => {
        // if (!this.isAdmin(ctx)) return ctx.reply('Unauthorized');
        if (!(await this.isAdmin(ctx))) return ctx.reply('❌ You are not authorized to use this bot.');

      const title = ctx.message.text.split(' ').slice(1).join(' ');
      if (!title) return ctx.reply("Usage: /menu <title>");

      const node = await this.menusService.findByTitle(title);
      if (!node) return ctx.reply("Menu not found.");

      const subtree = this.formatTree([node]);
      await ctx.reply(`📁 *Menu: ${node.title}*\n${subtree}`, { parse_mode: "Markdown" });
    });

    // =========================
    // ADD MENU
    // =========================
    this.bot.command('addmenu', async (ctx) => {
        // if (!this.isAdmin(ctx)) return ctx.reply('Unauthorized');
        if (!(await this.isAdmin(ctx))) return ctx.reply('❌ You are not authorized to use this bot.');

      const parts = ctx.message.text.split(' ').slice(1);
      const parentTitle = parts[0] || 'null';
      const title = parts.slice(1).join(' ');

      if (!title) return ctx.reply("Usage: /addmenu <parent|null> <title>");

      try {
        const node = await this.menusService.addMenu(parentTitle, { title });
        await ctx.reply(`✅ Added *${node.title}*`, { parse_mode: "Markdown" });
      } catch (err: any) {
        await ctx.reply(`❌ ${err.message}`);
      }
    });

    // =========================
    // EDIT MENU
    // ========================

    this.bot.command('editmenu', async (ctx) => {
      // if (!this.isAdmin(ctx)) return ctx.reply("Unauthorized");
      if (!(await this.isAdmin(ctx))) return ctx.reply('❌ You are not authorized to use this bot.');

      const parts = ctx.message.text.split(' ').slice(1);
    
      const target = parts[0]; // title OR uuid
      const newTitle = parts.slice(1).join(' ');
    
      if (!target || !newTitle) {
        return ctx.reply("Usage: /editmenu <title|uuid> <new title>");
      }
    
      try {
        // 1. Try finding by UUID
        let menu = null;
        if (/^[0-9a-fA-F-]{10,}$/.test(target)) {
          menu = await this.menusService.findByUUID(target);
        }
    
        // 2. If not found, try by title
        if (!menu) {
          menu = await this.menusService.findByTitle(target);
        }
    
        if (!menu) {
          return ctx.reply(`❌ Menu not found with title or ID: ${target}`);
        }
    
        // 3. Update the title
        const updated = await this.menusService.updateMenu(menu.id, {
          title: newTitle,
        });
    
        return ctx.reply(
          `✅ Updated menu:\n*${menu.title}* → *${updated.title}*`,
          { parse_mode: "Markdown" }
        );
      } catch (err: any) {
        return ctx.reply(`❌ ${err.message}`);
      }
    });    


    // =========================
    // DELETE MENU
    // =========================
    // this.bot.command('deletemenu', async (ctx) => {
    //     // if (!this.isAdmin(ctx)) return ctx.reply('Unauthorized');
    //     const id = ctx.message.text.split(' ')[1];
    //     if (!id) return ctx.reply("Usage: /deletemenu <id>");

    //     try {
    //         await this.menusService.removeNodeById(id);
    //         await ctx.reply(`🗑 Deleted menu: \`${id}\``, { parse_mode: "Markdown" });
    //     } catch (err: any) {
    //         await ctx.reply(`❌ ${err.message}`);
    //     }
    // });

    // =============================
    // DELETE MENU (WITH CONFIRMATION)
    // =============================
    this.bot.command('deletemenu', async (ctx) => {
      if (!(await this.isAdmin(ctx))) return ctx.reply('❌ You are not authorized to use this bot.');

        const adminId = ctx.from.id.toString();
        const args = ctx.message.text.split(' ').slice(1);
        const query = args.join(' ');

        if (!query) {
            return ctx.reply(
                "⚠️ Usage:\n`/deletemenu <menuId | full menu title>`",
                { parse_mode: "Markdown" }
            );
        }

        // 1. Try finding by ID
        let menu = await this.menusService.findOne(query);

        // 2. If not found, try by full title
        if (!menu) {
            menu = await this.menusService.findByTitle(query);
        }

        if (!menu) {
            return ctx.reply("❌ Menu not found.");
        }

        // 3. Check if menu has active tickets
        const titlesToCheck = [menu.title];

        const collect = (node) => {
            if (!node.children) return;
            for (const child of node.children) {
                titlesToCheck.push(child.title);
                collect(child);
            }
        };
        collect(menu);

        const activeTickets = await this.ticketsService.findTicketsByTagsOrTypes(titlesToCheck);

        if (activeTickets.length > 0) {
            const list = activeTickets
                .map(t => `• #\`${t.ticketNumber}\` — ${t.type || t.tag}`)
                .join('\n');

            return ctx.reply(
                `🚫 *Cannot delete menu.*\n` +
                `This menu or its submenus have *active tickets*.\n\n${list}`,
                { parse_mode: "Markdown" }
            );
        }

        // 4. Ask for confirmation
        this.pendingDeletes.set(adminId, menu.id);

        return ctx.reply(
            `❗ *Confirm Delete*\n\n` +
            `Are you sure you want to delete:\n*${menu.title}*\n\`${menu.id}\`\n\n` +
            `Reply with *YES* or *NO*.`,
            { parse_mode: "Markdown" }
        );
    });


    // =============================
    // LISTEN FOR YES / NO AFTER DELETE REQUEST
    // =============================
    this.bot.hears(/^(YES|NO)$/i, async (ctx) => {
      if (!(await this.isAdmin(ctx))) return ctx.reply('❌ You are not authorized to use this bot.');
        const adminId = ctx.from.id.toString();

        if (!this.pendingDeletes.has(adminId)) {
            return; // ignore random YES/NO messages
        }

        const response = ctx.message.text.toUpperCase();

        if (response === "NO") {
            this.pendingDeletes.delete(adminId);
            return ctx.reply("❎ Delete cancelled.");
        }

        if (response === "YES") {
            const id = this.pendingDeletes.get(adminId);
            this.pendingDeletes.delete(adminId);

            try {
                await this.menusService.removeNodeById(id);
                return ctx.reply(
                    `🗑 *Menu deleted successfully*\n\`${id}\``,
                    { parse_mode: "Markdown" }
                );
            } catch (err: any) {
                return ctx.reply(`❌ ${err.message}`);
            }
        }
    });


    // =========================
    // ADD A CREATETICKET MENU
    // =========================
    this.bot.command('create_ticket_menu', async (ctx) => {

      if (!(await this.isAdmin(ctx))) return ctx.reply('❌ You are not authorized to use this bot.');

      // Remove command prefix
      const argsText = ctx.message.text.replace('/create_ticket_menu', '').trim();
    
      // If no args → show help
      if (!argsText) {
        const helpMessage = 
`📌 *Create Ticket Menu Command Help*

Usage:
  /create_ticket_menu <parentTitle|null> <field1,field2,...>

- parentTitle: Title of the parent menu. Use 'null' for root.
- field1,field2,... : Comma-separated ticket fields to collect.

*Example:*
  /create_ticket_menu Discord Role fullName,telegramUsername,wallet,discordUsername,email,images

*Available Ticket Fields:*
• fullName — User's full name  
• telegramUsername — Telegram username or phone number  
• email — Email address  
• wallet — Wallet address  
• chain — Blockchain / network  
• discordUsername — Discord username  
• username — Username for mini-app / airdrop  
• referralId — Referral ID  
• projectName — Project / collaboration name  
• offerDetails — Details of collaboration/offer  
• tier — Partnership tier  
• message — Detailed issue description  
• images — Screenshots / images (optional)  
• documents — Documents (optional)  
• callLink — Calendly / meeting link (optional)  
• note — Admin note / internal comment  
• scamAlert — Mark as scam alert  
• xpPoints — XP / leaderboard points  

This command will generate a menu and requirements submenu that dynamically guides users through these fields.`;
    
        return ctx.reply(helpMessage, { parse_mode: 'Markdown' });
      }
    
      // Split into pieces
      const parts = argsText.split(' ');
    
      // Find which part contains comma-separated fields
      const fieldIndex = parts.findIndex(p => p.includes(','));
    
      if (fieldIndex === -1) {
        return ctx.reply(`❌ Missing fields.\nExample:\n/create_ticket_menu Support fullName,email,message`);
      }
    
      // Parent title may contain spaces → join everything BEFORE the fields
      const parentTitle = parts.slice(0, fieldIndex).join(' ') || 'null';
    
      // Extract and clean fields
      const requiredFields = parts[fieldIndex]
        .split(',')
        .map(f => f.trim())
        .filter(Boolean);
    
      try {
        // Look up parent menu
        const parentNode = parentTitle !== 'null'
          ? await this.menusService.findByTitle(parentTitle)
          : null;
    
        const uniqueTitle = parentNode
          ? `Create Ticket - ${parentNode.title}`
          : 'Create Ticket';
    
        // Create the main menu
        const ticketMenu = await this.menusService.addMenu(parentTitle, {
          title: uniqueTitle,
          metadata: { requiredFields }
        });
    
        // Build requirements text
        let requirementsMessage = `📌 *Requirements*\n`;
    
        for (const field of requiredFields) {
          switch (field) {
            case 'fullName':
              requirementsMessage += `• Your full name\n`; break;
            case 'telegramUsername':
              requirementsMessage += `• Telegram username or phone number\n`; break;
            case 'email':
              requirementsMessage += `• Email address\n`; break;
            case 'wallet':
              requirementsMessage += `• Wallet address\n`; break;
            case 'chain':
              requirementsMessage += `• Blockchain / Network (optional)\n`; break;
            case 'discordUsername':
              requirementsMessage += `• Discord username\n`; break;
            case 'username':
              requirementsMessage += `• Username (for mini-app / airdrop)\n`; break;
            case 'referralId':
              requirementsMessage += `• Referral ID (optional)\n`; break;
            case 'projectName':
              requirementsMessage += `• Project name\n`; break;
            case 'offerDetails':
              requirementsMessage += `• Collaboration / Offer details\n`; break;
            case 'tier':
              requirementsMessage += `• Partnership tier\n`; break;
            case 'message':
              requirementsMessage += `• Detailed description of your issue\n`; break;
            case 'images':
              requirementsMessage += `• (Optional) Upload screenshots/images\n`; break;
            case 'documents':
              requirementsMessage += `• (Optional) Upload documents\n`; break;
            case 'callLink':
              requirementsMessage += `• (Optional) Calendly or meeting link\n`; break;
            default:
              requirementsMessage += `• ${field}\n`;
          }
        }
    
        // Create submenu
        await this.menusService.addMenu(ticketMenu.slug, {
          title: requirementsMessage,
          metadata: { requiredFields }
        });
    
        return ctx.reply(
          `🎫 *Create Ticket Menu Generated*\n\n` +
          `Parent: *${parentTitle}*\n` +
          `Created:\n` +
          `• ${uniqueTitle} (main menu)\n` +
          `• Requirements submenu\n\n` +
          `Fields: ${requiredFields.join(', ')}`,
          { parse_mode: 'Markdown' }
        );
    
      } catch (err: any) {
        return ctx.reply(`❌ Error: ${err.message}`);
      }
    });    
    
    // =========================
    // USERS
    // =========================

    this.bot.command('listusers', async (ctx) => {
        // if (!this.isAdmin(ctx)) return ctx.reply('Unauthorized');
        if (!(await this.isAdmin(ctx))) return ctx.reply('❌ You are not authorized to use this bot.');

        const users = await this.usersService.findAll();
      
        if (!users.length) {
          return ctx.reply("No users found in the system yet.");
        }
      
        const formatted = users
          .map((u) => `• *${u.username || 'No username'}* — \`${u.telegramId}\``)
          .join('\n');
      
        const output = `👥 *All Registered Users*\n${formatted}`
        return this.replyInChunks(ctx, output); // << SAFE
    });
      

    this.bot.command('user', async (ctx) => {
        // if (!this.isAdmin(ctx)) return ctx.reply('Unauthorized');
        if (!(await this.isAdmin(ctx))) return ctx.reply('❌ You are not authorized to use this bot.');

        const id = ctx.message.text.split(' ')[1];
        if (!id) return ctx.reply("Usage: /user <telegramId>");
      
        // const id = Number(idText);
      
        // Validate number
        // if (isNaN(id)) {
        //   return ctx.reply("❌ Telegram ID must be a number.");
        // }
      
        const user = await this.usersService.findByTelegramId(id);
        if (!user) return ctx.reply("User not found.");
      
        await ctx.reply(
      `👤 *User Info*
      • Username: *${user.username || 'N/A'}*
      • Telegram ID: \`${user.telegramId}\`
      • Created: ${user.createdAt}
      `, 
          { parse_mode: "Markdown" }
        );
    });
      

    // =========================
    // TICKETS
    // =========================

    // =========================
    // TICKETS: View a single ticket by ID or ticketNumber
    // =========================
    this.bot.command('ticket', async (ctx) => {
      if (!(await this.isAdmin(ctx))) return ctx.reply('❌ You are not authorized to use this bot.');

      const parts = ctx.message.text.split(' ');
      const arg = parts[1];
      const action = parts[2]; // optional: open or close
    
      if (!arg) {
        return ctx.reply(
          "Usage:\n" +
          "/ticket <ticketId|ticketNumber>  — Display ticket\n" +
          "/ticket <ticketId|ticketNumber> open  — Mark as OPEN\n" +
          "/ticket <ticketId|ticketNumber> close — Mark as CLOSED"
        );
      }
    
      let ticket;
    
      // Search by UUID
      if (isUUID(arg)) {
        ticket = await this.ticketsService.findTicketById(arg);
      }
    
      // Search by ticket number if not found
      if (!ticket) {
        ticket = await this.ticketsService.findOneByTicketNumber(arg);
      }
    
      if (!ticket) return ctx.reply("Ticket not found.");
    
      // -------------------------
      // Handle open/close commands
      // -------------------------
      if (action === 'open' || action === 'close') {
        ticket.status = action === 'close'; // true = CLOSED, false = OPEN
        await this.ticketsService.save(ticket);
    
        return ctx.reply(
          `🔧 Ticket *${ticket.ticketNumber}* is now *${ticket.status ? 'CLOSED' : 'OPEN'}*.`,
          { parse_mode: "Markdown" }
        );
      }

      const ticketList = this.formatTicketList([ticket], ticket.user.telegramId)
    
      // -------------------------
      // Default: display ticket info
      // -------------------------
      await ctx.reply( ticketList, { parse_mode: "Markdown" });
    
    });
    
    
    

    // =========================
    // LIST TICKETS
    //   1.

    // /listtickets
    // → Dashboard summary (all tickets)

    // 2.

    // /listtickets <telegramId>
    // → All tickets for one user

    // 3.

    // /listtickets type:<type>
    // /listtickets tag:<tag>
    // /listtickets ticket:<ticketNumber>
    // /listtickets wallet:<wallet>
    // /listtickets status:<open|closed>
    // → Dynamic filtering

    // 4.

    // Combination filtering:
    // /listtickets type:purchase status:open tag:USDT
    // =========================

    this.bot.command('listtickets', async (ctx) => {
      if (!(await this.isAdmin(ctx))) return ctx.reply('❌ You are not authorized to use this bot.');

      // Extract raw arguments
      const rawArgs = ctx.message.text.split(' ').slice(1);
      const args = rawArgs.filter(a => a.trim() !== ""); // remove empty
      console.log("ARGS:", args);

      // ---------------------------------------------
      // 1. Dashboard (no arguments)
      // ---------------------------------------------
      if (args.length === 0) {
        const tickets = await this.ticketsService.findAll();
        if (!tickets.length) return ctx.reply("No tickets exist yet.");

        const total = tickets.length;
        const byType: Record<string, number> = {};
        const byTag: Record<string, number> = {};
        const byStatus: Record<string, number> = { Open: 0, Closed: 0 };

        tickets.forEach(t => {
          byType[t.type] = (byType[t.type] || 0) + 1;
          byTag[t.tag] = (byTag[t.tag] || 0) + 1;

          const statusLabel = t.status ? "Closed" : "Open";
          byStatus[statusLabel]++;
        });

        let text = `🎟 *Tickets Dashboard*\n\nTotal Tickets: *${total}*\n\n`;

        text += `*By Type:*\n`;
        for (const type in byType) text += `• ${type}: ${byType[type]}\n`;

        text += `\n*By Tag:*\n`;
        for (const tag in byTag) text += `• ${tag}: ${byTag[tag]}\n`;

        text += `\n*By Status:*\n`;
        for (const st in byStatus) text += `• ${st}: ${byStatus[st]}\n`;

        return this.replyInChunks(ctx, text); // << SAFE
      }

      // ---------------------------------------------
      // 2. Telegram ID lookup (first arg is a number)
      // ---------------------------------------------
      if (/^\d+$/.test(args[0])) {
        const telegramId = args[0];
        const user = await this.usersService.findByTelegramId(telegramId);

        if (!user) return ctx.reply("User not found.");

        const tickets = await this.ticketsService.findTicketsByUser(user.id);
        if (!tickets.length) return ctx.reply("User has no tickets.");

        return this.replyInChunks(ctx, formatTicketLists(tickets, telegramId)); // << SAFE
      }

      // ---------------------------------------------
      // 3. Dynamic filtering
      // ---------------------------------------------
      const filters: any = {};

      args.forEach(arg => {
        const [key, value] = arg.split(':');
        console.log("Filter Arg:", arg, "Value:", value);

        if (!value) return;

        switch (key.toLowerCase()) {
          case 'type':   filters.type = value; break;
          case 'tag':    filters.tag = value; break;
          case 'ticket': filters.ticketNumber = value; break;
          case 'wallet': filters.wallet = value; break;
          case 'status':
            filters.status = value.toLowerCase() === 'closed';
            break;
        }
      });

      const tickets = await this.ticketsService.filterTickets(filters);

      if (!tickets.length)
        return ctx.reply("No tickets found for the selected filters.");

      const output = formatTicketLists(tickets);

      return this.replyInChunks(ctx, output); // << SAFE
    });



    // =========================
    // PROPERTY LOOKUP
    // =========================
    this.bot.command('get', async (ctx) => {
        // if (!this.isAdmin(ctx)) return ctx.reply('Unauthorized');
        if (!(await this.isAdmin(ctx))) return ctx.reply('❌ You are not authorized to use this bot.');

      const [entity, id, prop] = ctx.message.text.split(' ').slice(1);

      if (!entity || !id || !prop)
        return ctx.reply("Usage: /get <entity> <id> <property>");

      let obj: any = null;

      if (entity === 'user') {
        // const idNumber = Number(id)
        obj = await this.usersService.findByTelegramId(id);
      } else if(entity === 'ticket') {
         obj = await this.ticketsService.findTicketById(id);
      } else if (entity === 'menu') {
        obj = await this.menusService.findByTitle(id);
      } else {
        return ctx.reply("Entity must be user | ticket | menu");
      }

      if (!obj) return ctx.reply("Item not found.");

      await ctx.reply(`📌 *${entity}.${prop}:* ${obj[prop]}`, {
        parse_mode: "Markdown",
      });
    });

    // =========================
    // EXPORT TICKETS
    // =========================
    this.bot.command('exporttickets', async (ctx) => {
      try {
        // Ensure admin
        // if (!this.isAdmin(ctx)) return ctx.reply('Unauthorized');
        if (!(await this.isAdmin(ctx))) return ctx.reply('❌ You are not authorized to use this bot.');
    
        // Parse filters from message
        // Example: /exporttickets type=Discord tag=Role status=Open userId=123
        const args = ctx.message.text.split(' ').slice(1);
        const filters: any = {};
        args.forEach(arg => {
          const [key, ...rest] = arg.split('=');
          if (!key || rest.length === 0) return;
          const value = rest.join('=').trim();
          if (!value) return;
    
          // Convert userId to number
          if (key === 'userId') filters.user = { id: Number(value) };
          else filters[key] = value;
        });
    
        const buffer = await this.ticketsService.exportTicketsToExcel(filters);
    
        // Send as file to Telegram
        await ctx.replyWithDocument({
          filename: `tickets_export_${Date.now()}.xlsx`,
          source: buffer,
        });
      } catch (err: any) {
        console.error('exporttickets error', err);
        await ctx.reply(`❌ Error exporting tickets: ${err.message}`);
      }
    });

    // =========================
    // EXPORT TICKETS HELP
    // =========================
    this.bot.command('exportticketshelp', async (ctx) => {
      // if (!this.isAdmin(ctx)) return ctx.reply('❌ Unauthorized');
      if (!(await this.isAdmin(ctx))) return ctx.reply('❌ You are not authorized to use this bot.');
    
      const text = `
    📤 *Ticket Export Guide*
    
    Export all tickets:
    \`/exporttickets\`
    
    ━━━━━━━━━━━━━━━━━━
    🔍 *Filter by Type*
    \`/exporttickets type=Purchase\`
    
    🔖 *Filter by Tag*
    \`/exporttickets tag=Whitelist\`
    
    🧩 *Multiple Filters*
    \`/exporttickets type=Discord tag=Role status=Open\`
    
    👤 *Filter by User*
    \`/exporttickets userId=2382332\`
    
    ━━━━━━━━━━━━━━━━━━
    📌 *Available Filters*
    • type  
    • tag  
    • status  
    • userId  
    • createdAt (optional extension)  
    
    ━━━━━━━━━━━━━━━━━━
    📘 *Example with 3 filters*
    \`/exporttickets type=Airdrop tag=XP userId=3910444\`
    
    Use these filters with the /exporttickets command to generate an Excel export that fits your needs.
    `;
    
      await ctx.reply(text, {
        parse_mode: "Markdown",
      });
    });
    
  }

}
