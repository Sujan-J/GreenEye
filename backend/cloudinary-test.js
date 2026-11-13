
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function testUpload() {
  try {
    const imageDir = path.resolve(
      '../ai-service/datasets/greeneye-litter/test/images'
    );

    const files = fs.readdirSync(imageDir)
      .filter(f => /\.(jpg|jpeg|png)$/i.test(f));

    if (!files.length) {
      throw new Error('No sample images found');
    }

    const imagePath = path.join(imageDir, files[0]);

    const result = await cloudinary.uploader.upload(imagePath, {
      folder: 'greeneye-diagnostics',
      resource_type: 'image'
    });

    console.log('CLOUDINARY UPLOAD SUCCESS!');
    console.log('Public ID:', result.public_id);
    console.log('Secure URL:', result.secure_url);

  } catch (error) {
    console.error('CLOUDINARY UPLOAD FAILED:', error.message);
  }
}

testUpload();
