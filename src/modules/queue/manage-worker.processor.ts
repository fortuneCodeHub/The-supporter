import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { DataSource } from 'typeorm';
import { Ticket } from '../tickets/ticket.entity/ticket.entity';
import { Telegraf } from 'telegraf';
import * as nodemailer from 'nodemailer';

// const connection = new IORedis(process.env.REDIS_URL);
const connection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null, // ← add this
});

// TypeORM manual connection (for worker process)
const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [Ticket],
  synchronize: false,
});

let dataSourceInitialized = false;

async function getRepo() {
  if (!dataSourceInitialized) {
    await AppDataSource.initialize();
    dataSourceInitialized = true;
  }
  return AppDataSource.getRepository(Ticket);
}

// Gmail transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const worker = new Worker(
  'tickets',
  async (job) => {
    if (job.name !== 'sendTicket') return;

    const repo = await getRepo();
    const ticket = await repo.findOne({ where: { id: job.data.ticketId } });

    if (!ticket) throw new Error('Ticket not found');

    const emailBody = `
New Fasqon Ticket

Ticket Number: ${ticket.ticketNumber}
Type: ${ticket.type}
Tag: ${ticket.tag}

User Info:
Full Name: ${ticket.fullName}
Telegram: @${ticket.telegramUsername}
Email: ${ticket.email}

Wallet: ${ticket.wallet ?? 'N/A'}
Chain: ${ticket.chain ?? 'N/A'}

Message:
${ticket.message}

Discord: ${ticket.discordUsername ?? 'N/A'}
Referral: ${ticket.referralId ?? 'N/A'}
Project: ${ticket.projectName ?? 'N/A'}

Created At: ${ticket.createdAt}
    `;

    try {
      // --------------------------
      // 1. TRY TO SEND EMAIL TO SUPPORT
      // --------------------------
      await transporter.sendMail({
        from: `"Fasqon Support" <${process.env.GMAIL_USER}>`,
        to: process.env.SUPPORT_EMAIL,
        subject: `New Support Ticket – ${ticket.type} – ${ticket.ticketNumber}`,
        text: emailBody,
      });

      ticket.emailed = true;
      await repo.save(ticket);
      console.log(`✅ Email sent for ticket ${ticket.ticketNumber}`);
    } catch (err) {
      console.error(`❌ Failed to send email for ticket ${ticket.ticketNumber}`, err);

      // --------------------------
      // 2. SEND TO TELEGRAM ONLY IF EMAIL FAILS
      // --------------------------
      try {
        const bot = new Telegraf(process.env.SUPPORT_BOT_TOKEN);

        const tgMsg = `
📩 *New Ticket (Email Failed)*
#${ticket.ticketNumber}

👤 User: @${ticket.telegramUsername}
🎫 Type: *${ticket.type}*
🏷 Tag: ${ticket.tag}

📝 *Message:*  
${ticket.message}

🗂 Wallet: ${ticket.wallet}
🌐 Chain: ${ticket.chain}
        `;

        await bot.telegram.sendMessage(process.env.SUPPORT_GROUP_ID, tgMsg, {
          parse_mode: 'Markdown',
        });
 
        ticket.forwardedToGroup = true;
        await repo.save(ticket);

        console.log(`✅ Ticket forwarded to Telegram group for ticket ${ticket.ticketNumber}`);
      } catch (tgErr) {
        console.error(`❌ Failed to forward ticket ${ticket.ticketNumber} to Telegram`, tgErr);
      }
    }
  },
  { connection },
);

console.log('📌 Ticket Worker Started...');
