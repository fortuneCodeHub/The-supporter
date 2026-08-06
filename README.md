<p align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg" width="120" alt="Telegram Logo" />
</p>

<h1 align="center">The-Supporter</h1>

<p align="center">
  Backend service powering <strong>Fasqon Support Bot</strong> — a Telegram bot that allows Fasqon community members to raise support tickets for issues outside the standard help menu, routing them directly to the support team via Telegram and email.
</p>

---

## What it does

- Community members create support tickets directly inside Telegram
- Tickets are routed automatically to the Fasqon support group and official support email
- Handles issues that fall outside the standard menu options
- Gives the support team a structured, trackable way to manage community requests
- Reduces unstructured support requests coming through DMs and chat threads

---

## Tech stack

- **NestJS** — backend framework
- **TypeScript** — language
- **Telegraf** — Telegram bot framework
- **Nodemailer** — email routing
- **pnpm** — package manager

---

## Project setup

```bash
pnpm install
```

## Compile and run

```bash
# development
pnpm run start

# watch mode
pnpm run start:dev

# production mode
pnpm run start:prod
```

---

## How it works

1. Community member sends a message to **Fasqon Support Bot** on Telegram
2. Bot prompts them to describe their issue and confirm submission
3. Ticket is created with a unique reference number
4. Ticket is forwarded to the Fasqon support group on Telegram
5. A copy is sent to the official Fasqon support email
6. Member receives a confirmation message with their ticket reference

---

## Deployment

Running on a VPS with PM2 for process management.

```bash
pm2 start dist/main.js --name the-supporter
pm2 save
```

---

## Author

**Fortune Nwohiri**
[github.com/fortuneCodeHub](https://github.com/fortuneCodeHub) · [fortune-nwohiri.vercel.app](https://fortune-nwohiri.vercel.app)

---

## License

Private