// import { Ticket } from "src/modules/tickets/ticket.entity/ticket.entity";

import { Ticket } from "../../modules/tickets/ticket.entity/ticket.entity";

export function generateUniqueTicketNumber(): string {
    const now = new Date();
    const datePart = now
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(2, 12); // YYMMDDHHMM
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomPart = '';
    for (let i = 0; i < 4; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `FSQN${datePart}-${randomPart}`;
}
  
export function formatTicketLists(tickets: any[] = [], label: string = "") {
    if (!Array.isArray(tickets)) tickets = [];
  
    let text = `🎟 *Tickets* ${label ? `for \`${label}\`` : ""}\n\n`;
  
    tickets.forEach(t => {
      const created = t.createdAt ? new Date(t.createdAt) : new Date();
  
      const formattedDate = created.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
  
      const status = t.status ? "Closed ❌" : "Open 🟢";
  
      text += 
  `• *Ticket:* \`${t.ticketNumber}\`
    • Type: *${t.type}*
    • Tag: ${t.tag}
    • Wallet: ${t.wallet ?? "N/A"}
    • Status: *${status}*
    • Created: _${formattedDate}_
  
  `;
    });
  
    return text;
}
  

export function prepareFields(ticket?: Ticket) {
    if (!ticket) return [];
  
    const fieldMap: Record<string, string> = {
      fullName: "Full Name",
      telegramUsername: "Telegram Username",
      email: "Email",
      wallet: "Wallet",
      chain: "Chain",
      message: "Message",
      discordUsername: "Discord Username",
      username: "Username",
      referralId: "Referral ID",
      projectName: "Project Name",
      offerDetails: "Offer Details",
      tier: "Tier",
      note: "Note",
      callLink: "Call Link",
      scamAlert: "Scam Alert",
      xpPoints: "XP Points",
    };
  
    const clean: { label: string; value: any }[] = [];
  
    for (const key of Object.keys(fieldMap)) {
      const value = (ticket as any)[key];
  
      if (value !== null && value !== undefined && value !== "") {
        clean.push({ label: fieldMap[key], value });
      }
    }
  
    return clean;
}
  
  

