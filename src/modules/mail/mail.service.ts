import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  async sendSupportEmail(
    to: string,
    subject: string,
    text: string,
    html?: string,
    timeoutMs = 3000, // ⬅️ 3s hard timeout
  ) {
    const sendPromise = this.transporter.sendMail({
      from: `"Fasqon Support" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Email send timeout')), timeoutMs),
    );

    try {
      await Promise.race([sendPromise, timeoutPromise]);
      this.logger.log(`Email successfully sent to ${to}`);
      return true;
    } catch (err) {
      this.logger.error('Email failed or timed out', err);
      return false; // ⬅️ IMPORTANT: do not throw
    }
  }
}
