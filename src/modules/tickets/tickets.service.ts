import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Ticket } from './ticket.entity/ticket.entity';
import { User } from '../users/users.entity/users.entity';
import { ImagesService } from '../images/images.service';
import * as ExcelJS from 'exceljs';
import { QueueService } from '../queue/queue.service';
import { prepareFields } from 'src/common/utils/helper-functions';

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket) private ticketRepository: Repository<Ticket>,
    private imagesService: ImagesService,
    private readonly queueService: QueueService,
  ) {}
  
  async createTicket(
    user: User,
    type: string,
    ticketNumber: string,
    tag: string,
    messageData: Record<string, any>,
    files?: any[],
    images?: any[],
  ): Promise<any> {
    let imageFiles: Buffer[] = [];
    let documentFiles: any[] = [];

    files?.forEach((file, i) => {
      let buffer: Buffer;

       // Case 2: PendingDocument { fileName, mimeType, buffer } check
      if (file && typeof file === "object" && "buffer" in file) {
        
        console.log(`File at index ${i} matched the document object structure check.`);

        // 1️⃣ JSON-like buffer (Telegram serialized Buffer)
        if (file.buffer?.type === "Buffer" && Array.isArray(file.buffer.data)) {
            console.log("Detected JSON-like serialized buffer. Reconstructing...");
            buffer = Buffer.from(file.buffer.data);

            documentFiles.push({
                fileName: file.fileName,
                mimeType: file.mimeType,
                buffer
            });

            return; // stop processing this file
        }

        // 2️⃣ Real Buffer (very rare)
        if (Buffer.isBuffer(file.buffer)) {
            console.log("Detected real Buffer instance.");
            buffer = file.buffer;

            documentFiles.push({
                fileName: file.fileName,
                mimeType: file.mimeType,
                buffer
            });

            return;
        }

        // 3️⃣ Invalid — neither a real Buffer nor JSON buffer
        console.error("❌ Invalid buffer format:", file);
        documentFiles.push({ error: "Invalid buffer format", file });
        return;
      } 
    });

    images?.forEach((image, i) => {
      let buffer: Buffer;
    
      // Case 1: direct Buffer
      if (Buffer.isBuffer(image)) {
        buffer = image;
        imageFiles.push(buffer);
        return;
      }

      // Case 3: raw serialized buffer { type, data }
      if (image?.type === "Buffer" && Array.isArray(image.data)) {
        buffer = Buffer.from(image.data);
        imageFiles.push(buffer);
        return;
      }
    
      // Case 4: ArrayBuffer / TypedArray
      if (ArrayBuffer.isView(image) || image instanceof ArrayBuffer) {
        buffer = Buffer.from(image as any);
        imageFiles.push(buffer);
        return;
      }
    
      // throw new Error(`File at index ${i} is not a valid buffer type`);
      // return "second case: the buffer is not here"
    })

    // Upload images
    const uploadedImages = await Promise.all(
      imageFiles.map(buffer => {
        console.log("image buffer", buffer)
        return this.imagesService.uploadFile(buffer, 'fasqon-support/tickets/images', 'image')
      })
    );


    const uploadedDocuments = await Promise.all(
      documentFiles.map(doc => {

        const buffer = doc.buffer;
        const originalFileName = doc.fileName || `document_${Date.now()}`;

        const fileExtension = originalFileName.split('.').pop(); // 'docx'
      
        const sanitizedPublicId = originalFileName
          .replace(/\.[^/.]+$/, '')        // Remove file extension
          .replace(/[^a-zA-Z0-9-_]/g, '_') // Replace unsafe characters
          .slice(0, 150);                  // Limit length

        return this.imagesService.uploadDocumentFile(
          buffer, 
          'fasqon-support/tickets/documents', // Specify folder
          '',
          fileExtension
        )
      })
    );

    let uploads = []

    uploads["uploadDocuments"] = uploadedDocuments
    uploads["uploadImages"] = uploadedImages
    uploads["imageFiles"] = imageFiles
    uploads["documentFiles"] = documentFiles

    console.log("These are the uploaded files", uploads);
    
    
  
    // -------------------------------
    // Extract fields from messageData
    // -------------------------------
    const {
      fullName,
      telegramUsername,
      email,
      wallet,
      chain,
      message,
      discordUsername,
      username,
      referralId,
      projectName,
      offerDetails,
      links,
      tier,
      note,
      callLink,
      scamAlert,
      xpPoints
    } = messageData;

    // Normalize links into array if comma-separated string
    const linksArray = typeof links === "string" ? links.split(',').map(l => l.trim()) : links;

    // -------------------------------
    // Create ticket entity
    // -------------------------------
    const ticket = this.ticketRepository.create({
      user,
      type,
      tag,
      ticketNumber,
      fullName,
      telegramUsername,
      email,
      wallet,
      chain,
      message,
      discordUsername,
      username,
      referralId,
      projectName,
      offerDetails,
      links: linksArray,
      tier,
      note,
      callLink,
      scamAlert: scamAlert === 'true' || scamAlert === true,
      xpPoints: xpPoints ? Number(xpPoints) : undefined,
      images: uploadedImages,
      documents: uploadedDocuments
    });
    const createdTicket = await this.ticketRepository.save(ticket);

    // forward ticket to support email 


    // Add this:
    // const response = await this.queueService.sendTicketToQueue(createdTicket.id);
    
    return createdTicket;
  }

  async findTicketsByUser(userId: number) {
    return this.ticketRepository.find({ where: { user: { id: userId } } });
  }

  async findTicketById(ticketId: string ) {
    return this.ticketRepository.findOne({ where: { id: ticketId } });
  }

  async findOneByTicketNumber(ticketNumber: string) {
    return this.ticketRepository.findOne({ where: { ticketNumber } });
  }

  async findAll() {
    return this.ticketRepository.find({ relations: ['user'] });
  }

  async filterTickets(filters: any) {
    return this.ticketRepository.find({
      where: filters,
      relations: ['user'],
    });
  }

  async save(ticket: Ticket) {
    return this.ticketRepository.save(ticket);
  }
  
  async findTicketsByTagsOrTypes(values: string[]) {
    return this.ticketRepository.find({
        where: [
            { type: In(values) },
            { tag: In(values) }
        ]
    });
  }

  async exportTicketsToExcel(filters: any = {}): Promise<Buffer> {
    const tickets = await this.ticketRepository.find({
      where: filters,
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Tickets');
  
    sheet.columns = [
      { header: 'Ticket ID', key: 'id', width: 36 },
      { header: 'Ticket Number', key: 'ticketNumber', width: 20 },
      { header: 'Type', key: 'type', width: 20 },
      { header: 'Tag', key: 'tag', width: 20 },
      { header: 'Full Name', key: 'fullName', width: 25 },
      { header: 'Telegram Username', key: 'telegramUsername', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Wallet', key: 'wallet', width: 25 },
      { header: 'Chain', key: 'chain', width: 15 },
      { header: 'Message', key: 'message', width: 60 },
      { header: 'Images', key: 'images', width: 50 },
      { header: 'Documents', key: 'documents', width: 50 },
      { header: 'Discord Username', key: 'discordUsername', width: 25 },
      { header: 'Username', key: 'username', width: 25 },
      { header: 'Referral ID', key: 'referralId', width: 25 },
      { header: 'Project Name', key: 'projectName', width: 30 },
      { header: 'Offer Details', key: 'offerDetails', width: 60 },
      { header: 'Links', key: 'links', width: 50 },
      { header: 'Tier', key: 'tier', width: 15 },
      { header: 'Note', key: 'note', width: 50 },
      { header: 'Call Link', key: 'callLink', width: 50 },
      { header: 'Scam Alert', key: 'scamAlert', width: 10 },
      { header: 'XP Points', key: 'xpPoints', width: 10 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Emailed', key: 'emailed', width: 10 },
      { header: 'Forwarded To Group', key: 'forwardedToGroup', width: 15 },
      { header: 'Created At', key: 'createdAt', width: 25 },
      { header: 'User ID', key: 'userId', width: 15 },
      { header: 'User Username', key: 'userUsername', width: 25 },
    ];
  
    tickets.forEach((t) => {
      sheet.addRow({
        id: t.id,
        ticketNumber: t.ticketNumber,
        type: t.type,
        tag: t.tag,
        fullName: t.fullName || '',
        telegramUsername: t.telegramUsername || '',
        email: t.email || '',
        wallet: t.wallet || '',
        chain: t.chain || '',
        message: t.message || '',
        images: t.images?.join(', ') || '',
        documents: t.documents?.join(', ') || '',
        discordUsername: t.discordUsername || '',
        username: t.username || '',
        referralId: t.referralId || '',
        projectName: t.projectName || '',
        offerDetails: t.offerDetails || '',
        links: t.links?.join(', ') || '',
        tier: t.tier || '',
        note: t.note || '',
        callLink: t.callLink || '',
        scamAlert: t.scamAlert ? 'Yes' : 'No',
        xpPoints: t.xpPoints ?? 0,
        status: t.status ? 'Closed' : 'Open',
        emailed: t.emailed ? 'Yes' : 'No',
        forwardedToGroup: t.forwardedToGroup ? 'Yes' : 'No',
        createdAt: t.createdAt.toISOString(),
        userId: t.user?.id ?? '',
        userUsername: t.user?.username ?? '',
      });
    });
  
    // Convert ArrayBuffer to Node.js Buffer
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
  
  async isImage(buffer: Buffer): Promise<boolean> {
    // very simple signature check:
    // PNG = 89 50 4E 47
    if (buffer.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47]))) return true;
  
    // JPG = FF D8 FF
    if (buffer.slice(0, 3).equals(Buffer.from([0xFF, 0xD8, 0xFF]))) return true;
  
    // WEBP = 52 49 46 46 .... 57 45 42 50
    if (
      buffer.slice(0, 4).toString() === 'RIFF' &&
      buffer.slice(8, 12).toString() === 'WEBP'
    ) return true;
  
    return false;
  }

}
