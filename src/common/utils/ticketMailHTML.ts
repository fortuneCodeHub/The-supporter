// utils/email-template.ts
function escapeHtml(str: any): string {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}
  
function isLikelyUrl(s: string) {
    if (!s) return false;
    return /^(https?:\/\/|\/\/)/i.test(s) || /\.[a-z]{2,}$/i.test(s);
}
  
// export function buildTicketEmailHtml(ticket: any): string {
//     const parts: string[] = [];
  
//     // Header
//     parts.push(`
//       <div style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; color:#111; line-height:1.4;">
//         <h2 style="margin:0 0 8px 0;">New Fasqon Support Ticket</h2>
//         <p style="margin:0 0 16px 0; color:#555;">Ticket created: ${ticket?.createdAt ? escapeHtml(
//           (new Date(ticket.createdAt)).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' })
//         ) : escapeHtml(new Date().toISOString())}</p>
//     `);
  
//     // Ticket meta
//     parts.push('<section style="margin-bottom:12px">');
//     parts.push('<h3 style="margin:6px 0;">Ticket info</h3>');
//     parts.push('<table cellpadding="4" cellspacing="0" style="border-collapse:collapse;">');
  
//     parts.push(`<tr><td style="vertical-align:top;font-weight:600;padding-right:8px">Ticket Number</td><td>${escapeHtml(ticket.ticketNumber)}</td></tr>`);
//     if (ticket.type) parts.push(`<tr><td style="vertical-align:top;font-weight:600;padding-right:8px">Type</td><td>${escapeHtml(ticket.type)}</td></tr>`);
//     if (ticket.tag) parts.push(`<tr><td style="vertical-align:top;font-weight:600;padding-right:8px">Tag</td><td>${escapeHtml(ticket.tag)}</td></tr>`);
//     parts.push('</table>');
//     parts.push('</section>');
  
//     // User info
//     const userRows: string[] = [];
//     if (ticket.fullName) userRows.push(`<tr><td style="font-weight:600;padding-right:8px">Full name</td><td>${escapeHtml(ticket.fullName)}</td></tr>`);
//     if (ticket.telegramUsername) userRows.push(`<tr><td style="font-weight:600;padding-right:8px">Telegram</td><td>@${escapeHtml(ticket.telegramUsername)}</td></tr>`);
//     if (ticket.email) userRows.push(`<tr><td style="font-weight:600;padding-right:8px">Email</td><td>${escapeHtml(ticket.email)}</td></tr>`);
//     if (userRows.length) {
//       parts.push('<section style="margin-bottom:12px">');
//       parts.push('<h3 style="margin:6px 0;">User info</h3>');
//       parts.push('<table cellpadding="4" cellspacing="0" style="border-collapse:collapse;">');
//       parts.push(...userRows);
//       parts.push('</table>');
//       parts.push('</section>');
//     }
  
//     // Wallet / chain
//     const walletRows: string[] = [];
//     if (ticket.wallet) walletRows.push(`<tr><td style="font-weight:600;padding-right:8px">Wallet</td><td>${escapeHtml(ticket.wallet)}</td></tr>`);
//     if (ticket.chain) walletRows.push(`<tr><td style="font-weight:600;padding-right:8px">Chain</td><td>${escapeHtml(ticket.chain)}</td></tr>`);
//     if (walletRows.length) {
//       parts.push('<section style="margin-bottom:12px">');
//       parts.push('<h3 style="margin:6px 0;">Wallet / Chain</h3>');
//       parts.push('<table cellpadding="4" cellspacing="0" style="border-collapse:collapse;">');
//       parts.push(...walletRows);
//       parts.push('</table>');
//       parts.push('</section>');
//     }
  
//     // Message
//     if (ticket.message) {
//       parts.push('<section style="margin-bottom:12px">');
//       parts.push('<h3 style="margin:6px 0;">Message</h3>');
//       parts.push(`<div style="white-space:pre-wrap;padding:8px;border:1px solid #eee;border-radius:6px;background:#fafafa">${escapeHtml(ticket.message)}</div>`);
//       parts.push('</section>');
//     }
  
//     // Platform / social / project
//     const otherRows: string[] = [];
//     if (ticket.discordUsername) otherRows.push(`<tr><td style="font-weight:600;padding-right:8px">Discord</td><td>${escapeHtml(ticket.discordUsername)}</td></tr>`);
//     if (ticket.username) otherRows.push(`<tr><td style="font-weight:600;padding-right:8px">Platform username</td><td>${escapeHtml(ticket.username)}</td></tr>`);
//     if (ticket.referralId) otherRows.push(`<tr><td style="font-weight:600;padding-right:8px">Referral ID</td><td>${escapeHtml(ticket.referralId)}</td></tr>`);
//     if (ticket.projectName) otherRows.push(`<tr><td style="font-weight:600;padding-right:8px">Project</td><td>${escapeHtml(ticket.projectName)}</td></tr>`);
//     if (ticket.offerDetails) otherRows.push(`<tr><td style="font-weight:600;padding-right:8px">Offer details</td><td>${escapeHtml(ticket.offerDetails)}</td></tr>`);
//     if (ticket.tier) otherRows.push(`<tr><td style="font-weight:600;padding-right:8px">Tier</td><td>${escapeHtml(ticket.tier)}</td></tr>`);
//     if (ticket.note) otherRows.push(`<tr><td style="font-weight:600;padding-right:8px">Note</td><td>${escapeHtml(ticket.note)}</td></tr>`);
//     if (ticket.callLink) otherRows.push(`<tr><td style="font-weight:600;padding-right:8px">Call link</td><td>${escapeHtml(ticket.callLink)}</td></tr>`);
//     if (ticket.scamAlert) otherRows.push(`<tr><td style="font-weight:600;padding-right:8px">Scam alert</td><td>Yes</td></tr>`);
//     if (typeof ticket.xpPoints !== 'undefined' && ticket.xpPoints !== null) otherRows.push(`<tr><td style="font-weight:600;padding-right:8px">XP points</td><td>${escapeHtml(ticket.xpPoints)}</td></tr>`);
  
//     if (otherRows.length) {
//       parts.push('<section style="margin-bottom:12px">');
//       parts.push('<h3 style="margin:6px 0;">Additional info</h3>');
//       parts.push('<table cellpadding="4" cellspacing="0" style="border-collapse:collapse;">');
//       parts.push(...otherRows);
//       parts.push('</table>');
//       parts.push('</section>');
//     }
  
//     // Links
//     if (Array.isArray(ticket.links) && ticket.links.length) {
//       const linkItems = ticket.links.map((l: string) => {
//         const escaped = escapeHtml(l);
//         return isLikelyUrl(l) ? `<li><a href="${escaped}" target="_blank" rel="noopener noreferrer">${escaped}</a></li>` : `<li>${escaped}</li>`;
//       }).join('');
//       parts.push('<section style="margin-bottom:12px">');
//       parts.push('<h3 style="margin:6px 0;">Links</h3>');
//       parts.push(`<ul>${linkItems}</ul>`);
//       parts.push('</section>');
//     }
  
//     // Images & Documents (render as list of links if they look like URLs, otherwise list filenames)
//     if (Array.isArray(ticket.images) && ticket.images.length) {
//       const imgItems = ticket.images.map((i: string) => {
//         const escaped = escapeHtml(i);
//         return isLikelyUrl(i) ? `<li><a href="${escaped}" target="_blank" rel="noopener noreferrer">${escaped}</a></li>` : `<li>${escaped}</li>`;
//       }).join('');
//       parts.push('<section style="margin-bottom:12px">');
//       parts.push('<h3 style="margin:6px 0;">Images</h3>');
//       parts.push(`<ul>${imgItems}</ul>`);
//       parts.push('</section>');
//     }
  
//     if (Array.isArray(ticket.documents) && ticket.documents.length) {
//       const docItems = ticket.documents.map((d: string) => {
//         const escaped = escapeHtml(d);
//         return isLikelyUrl(d) ? `<li><a href="${escaped}" target="_blank" rel="noopener noreferrer">${escaped}</a></li>` : `<li>${escaped}</li>`;
//       }).join('');
//       parts.push('<section style="margin-bottom:12px">');
//       parts.push('<h3 style="margin:6px 0;">Documents</h3>');
//       parts.push(`<ul>${docItems}</ul>`);
//       parts.push('</section>');
//     }
  
//     // Footer
//     parts.push(`
//         <hr style="border:none;border-top:1px solid #eee;margin:18px 0;">
//         <p style="font-size:12px;color:#666;margin:0">This message was generated automatically by Fasqon Support.</p>
//       </div>
//     `);
  
//     return parts.join('\n');
// }

export function buildTicketEmailHtml(ticket: any): string {
  const parts: string[] = [];

  parts.push(`
    <div style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; color:#111; line-height:1.5; text-align:center; max-width:600px; margin:auto; padding:0 16px;">
      
      <!-- Light green banner -->
      <div style="background:#1dff65; padding:16px; border-radius:8px 8px 0 0;">
        <h1 style="margin:0; font-size:32px; font-weight:bold; color:#111; letter-spacing:2px;">FASQON</h1>
      </div>

      <!-- Ticket Header -->
      <h2 style="margin:24px 0 8px 0; font-size:24px; font-weight:bold;">New Support Ticket</h2>
      <p style="margin:0 0 24px 0; color:#555;">
        Ticket created: ${ticket?.createdAt ? escapeHtml(
          (new Date(ticket.createdAt)).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' })
        ) : escapeHtml(new Date().toISOString())}
      </p>

      <!-- Ticket Info -->
      <section style="margin-bottom:20px;">
        <h3 style="margin:12px 0; font-size:18px; font-weight:bold;">Ticket Info</h3>
        <table cellpadding="8" cellspacing="0" style="margin:auto; border-collapse:collapse; width:100%;">
          <tr><td style="font-weight:600; text-align:right; width:35%;">Ticket Number</td><td>${escapeHtml(ticket.ticketNumber)}</td></tr>
          ${ticket.type ? `<tr><td style="font-weight:600; text-align:right;">Type</td><td>${escapeHtml(ticket.type)}</td></tr>` : ''}
          ${ticket.tag ? `<tr><td style="font-weight:600; text-align:right;">Tag</td><td>${escapeHtml(ticket.tag)}</td></tr>` : ''}
        </table>
      </section>

      <!-- User Info -->
      ${ticket.fullName || ticket.telegramUsername || ticket.email ? `
        <section style="margin-bottom:20px;">
          <h3 style="margin:12px 0; font-size:18px; font-weight:bold;">User Info</h3>
          <table cellpadding="8" cellspacing="0" style="margin:auto; border-collapse:collapse; width:100%;">
            ${ticket.fullName ? `<tr><td style="font-weight:600; text-align:right;">Full Name</td><td>${escapeHtml(ticket.fullName)}</td></tr>` : ''}
            ${ticket.telegramUsername ? `<tr><td style="font-weight:600; text-align:right;">Telegram</td><td>${escapeHtml(ticket.telegramUsername)}</td></tr>` : ''}
            ${ticket.email ? `<tr><td style="font-weight:600; text-align:right;">Email</td><td>${escapeHtml(ticket.email)}</td></tr>` : ''}
          </table>
        </section>
      ` : ''}

      <!-- Wallet / Chain -->
      ${ticket.wallet || ticket.chain ? `
        <section style="margin-bottom:20px;">
          <h3 style="margin:12px 0; font-size:18px; font-weight:bold;">Wallet / Chain</h3>
          <table cellpadding="8" cellspacing="0" style="margin:auto; border-collapse:collapse; width:100%;">
            ${ticket.wallet ? `<tr><td style="font-weight:600; text-align:right;">Wallet</td><td>${escapeHtml(ticket.wallet)}</td></tr>` : ''}
            ${ticket.chain ? `<tr><td style="font-weight:600; text-align:right;">Chain</td><td>${escapeHtml(ticket.chain)}</td></tr>` : ''}
          </table>
        </section>
      ` : ''}

      <!-- Message -->
      ${ticket.message ? `
        <section style="margin-bottom:20px;">
          <h3 style="margin:12px 0; font-size:18px; font-weight:bold;">Message</h3>
          <div style="padding:12px; border:1px solid #eee; border-radius:8px; background:#fafafa; text-align:left; white-space:pre-wrap;">${escapeHtml(ticket.message)}</div>
        </section>
      ` : ''}

      <!-- Additional Info -->
      <section style="margin-bottom:20px;">
        <h3 style="margin:12px 0; font-size:18px; font-weight:bold;">Additional Info</h3>
        <table cellpadding="8" cellspacing="0" style="margin:auto; border-collapse:collapse; width:100%;">
          ${ticket.discordUsername ? `<tr><td style="font-weight:600; text-align:right;">Discord</td><td>${escapeHtml(ticket.discordUsername)}</td></tr>` : ''}
          ${ticket.username ? `<tr><td style="font-weight:600; text-align:right;">Platform Username</td><td>${escapeHtml(ticket.username)}</td></tr>` : ''}
          ${ticket.referralId ? `<tr><td style="font-weight:600; text-align:right;">Referral ID</td><td>${escapeHtml(ticket.referralId)}</td></tr>` : ''}
          ${ticket.projectName ? `<tr><td style="font-weight:600; text-align:right;">Project</td><td>${escapeHtml(ticket.projectName)}</td></tr>` : ''}
          ${ticket.offerDetails ? `<tr><td style="font-weight:600; text-align:right;">Offer Details</td><td>${escapeHtml(ticket.offerDetails)}</td></tr>` : ''}
          ${ticket.tier ? `<tr><td style="font-weight:600; text-align:right;">Tier</td><td>${escapeHtml(ticket.tier)}</td></tr>` : ''}
          ${ticket.note ? `<tr><td style="font-weight:600; text-align:right;">Note</td><td>${escapeHtml(ticket.note)}</td></tr>` : ''}
          ${ticket.callLink ? `<tr><td style="font-weight:600; text-align:right;">Call Link</td><td>${escapeHtml(ticket.callLink)}</td></tr>` : ''}
          ${ticket.scamAlert ? `<tr><td style="font-weight:600; text-align:right;">Scam Alert</td><td>Yes</td></tr>` : ''}
          ${typeof ticket.xpPoints !== 'undefined' && ticket.xpPoints !== null ? `<tr><td style="font-weight:600; text-align:right;">XP Points</td><td>${escapeHtml(ticket.xpPoints)}</td></tr>` : ''}
        </table>
      </section>

      <!-- Links -->
      ${Array.isArray(ticket.links) && ticket.links.length ? `
        <section style="margin-bottom:20px;">
          <h3 style="margin:12px 0; font-size:18px; font-weight:bold;">Links</h3>
          <ul style="text-align:left; padding-left:20px;">
            ${ticket.links.map((l: string) => {
              const escaped = escapeHtml(l);
              return isLikelyUrl(l) ? `<li><a href="${escaped}" target="_blank" rel="noopener noreferrer">${escaped}</a></li>` : `<li>${escaped}</li>`;
            }).join('')}
          </ul>
        </section>
      ` : ''}

      <!-- Images / Documents -->
      ${Array.isArray(ticket.images) && ticket.images.length ? `
        <section style="margin-bottom:20px;">
          <h3 style="margin:12px 0; font-size:18px; font-weight:bold;">Images</h3>
          <ul style="text-align:left; padding-left:20px;">
            ${ticket.images.map((i: string) => {
              const escaped = escapeHtml(i);
              return isLikelyUrl(i) ? `<li><a href="${escaped}" target="_blank" rel="noopener noreferrer">${escaped}</a></li>` : `<li>${escaped}</li>`;
            }).join('')}
          </ul>
        </section>
      ` : ''}

      ${Array.isArray(ticket.documents) && ticket.documents.length ? `
        <section style="margin-bottom:20px;">
          <h3 style="margin:12px 0; font-size:18px; font-weight:bold;">Documents</h3>
          <ul style="text-align:left; padding-left:20px;">
            ${ticket.documents.map((d: string) => {
              const escaped = escapeHtml(d);
              return isLikelyUrl(d) ? `<li><a href="${escaped}" target="_blank" rel="noopener noreferrer">${escaped}</a></li>` : `<li>${escaped}</li>`;
            }).join('')}
          </ul>
        </section>
      ` : ''}

      <!-- Footer -->
      <hr style="border:none; border-top:1px solid #eee; margin:24px 0;">
      <p style="font-size:12px; color:#666; margin:0;">This message was generated automatically by Fasqon Support.</p>
    </div>
  `);

  return parts.join('\n');
}



  