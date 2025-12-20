import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// });

@Injectable()
export class ImagesService {
  constructor() {
    // console.log('Cloudinary ENV:', {
    //   CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    //   CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    //   CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
    // });

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  // async uploadFile(fileBuffer: Buffer, folder: string = 'fasqon-support/tickets'): Promise<string> {
  //   return new Promise((resolve, reject) => {
  //     const stream = cloudinary.uploader.upload_stream(
  //       { folder },
  //       (error, result) => {
  //         if (error) return reject(error);
  //         resolve(result.secure_url);
  //       },
  //     );
  //     const readable = new Readable();
  //     readable._read = () => {};
  //     readable.push(fileBuffer);
  //     readable.push(null);
  //     readable.pipe(stream);
  //   });
  // }

  // async uploadFile(fileBuffer: Buffer, folder: string = 'fasqon-support/tickets/images'): Promise<string> {
  //   if (!Buffer.isBuffer(fileBuffer)) {
  //     throw new Error('ImagesService.uploadFile: fileBuffer must be a Buffer');
  //   }
  
  //   return new Promise((resolve, reject) => {
  //     const stream = cloudinary.uploader.upload_stream(
  //       { folder },
  //       (error, result) => {
  //         if (error) return reject(error);
  //         resolve(result.secure_url);
  //       },
  //     );
  
  //     const readable = new Readable({
  //       read() {
  //         this.push(fileBuffer);
  //         this.push(null);
  //       }
  //     });
  
  //     readable.pipe(stream);
  //   });
  // }

  // async uploadFile(
  //   fileBuffer: Buffer,
  //   folder: string = 'fasqon-support/tickets/images',
  //   resourceType: 'image' | 'raw' = 'image'
  // ): Promise<string> {
  //   if (!Buffer.isBuffer(fileBuffer)) {
  //     throw new Error('ImagesService.uploadFile: fileBuffer must be a Buffer');
  //   }
  
  //   return new Promise((resolve, reject) => {
  //     const stream = cloudinary.uploader.upload_stream(
  //       { folder, resource_type: resourceType },
  //       (error, result) => {
  //         if (error) return reject(error);
  //         resolve(result.secure_url);
  //       },
  //     );
  
  //     const readable = new Readable({
  //       read() {
  //         this.push(fileBuffer);
  //         this.push(null);
  //       }
  //     });
  
  //     readable.pipe(stream);
  //   });
  // }
  
  async uploadFile(
    fileBuffer: Buffer,
    folder: string = 'fasqon-support/tickets/images',
    resourceType: 'image' | 'raw' | 'auto' = 'image',
    publicId?: string
  ): Promise<string> {
    if (!Buffer.isBuffer(fileBuffer)) {
      throw new Error('ImagesService.uploadFile: fileBuffer must be a Buffer');
    }

    return new Promise((resolve, reject) => {
      const params: any = { folder, resource_type: resourceType };
      if (publicId) params.public_id = publicId;

      const stream = cloudinary.uploader.upload_stream(params, (error, result) => {
        if (error) return reject(error);
        if (!result || !result.secure_url) return reject(new Error('Cloudinary upload failed'));
        resolve(result.secure_url);
      });

      const readable = new Readable({
        read() {
          this.push(fileBuffer);
          this.push(null);
        }
      });

      readable.pipe(stream);
    });
  }

  async uploadDocumentFile(
    fileBuffer: Buffer,
    folder: string = 'fasqon-support/tickets/documents',
    publicId?: string,
    format?: string // ⭐ new parameter to preserve extension
  ): Promise<string> {
  
    if (!Buffer.isBuffer(fileBuffer)) {
      throw new Error('ImagesService.uploadDocumentFile: fileBuffer must be a Buffer');
    }
  
    return new Promise((resolve, reject) => {
      const params: any = {
        folder,
        resource_type: 'raw', // RAW is required for DOCX, PDF, ZIP, etc.
      };
  
      if (publicId) params.public_id = publicId;
      if (format) params.format = format; // ⭐ pass the extension here
  
      const uploadStream = cloudinary.uploader.upload_stream(
        params,
        (error, result) => {
          if (error) return reject(error);
          if (!result || !result.secure_url) {
            return reject(new Error('Cloudinary raw upload failed'));
          }
          resolve(result.secure_url);
        }
      );
  
      // Upload the buffer directly to avoid corruption
      uploadStream.end(fileBuffer);
    });
  }
  
  
}
