import fs from 'fs';
import FormData from 'form-data';
import axios from 'axios';

const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || 'http://localhost:8000';


export async function detectLitterVideo(videoPath) {
  try {
    const form = new FormData();

    form.append(
      'file',
      fs.createReadStream(videoPath)
    );

    const response = await axios.post(
      `${AI_SERVICE_URL}/detect-video`,
      form,
      {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    return response.data;

  } catch (error) {
    const details =
      error.response?.data?.message ||
      error.message;

    console.error(
      'GreenEye video AI service error:',
      details
    );

    throw new Error(details);
  }
}

export async function detectLitter(imagePath) {

  try {

    const form = new FormData();

    form.append(
      'file',
      fs.createReadStream(imagePath)
    );


    const response = await axios.post(
      `${AI_SERVICE_URL}/detect`,
      form,
      {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );


    return response.data;


  } catch (error) {

    console.error(
      'GreenEye AI service error:',
      error.message
    );


    throw new Error(
      'AI detection service unavailable'
    );

  }

}