
import fs, { readFile, unlink } from 'fs'

import path from 'path'

import CloudConvert from 'cloudconvert';

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { NextRequest } from 'next/server'
import axios from 'axios';


interface OfficeToPDFProps{
  arrayBuffer:ArrayBuffer
}


const FILE_NAME = "extension";
const FILE_PATH = "/tmp";
const EXTENSION = ".docx"
const filePath = path.join(FILE_PATH, FILE_NAME + EXTENSION)
const filePDFPath = path.join(FILE_PATH, FILE_NAME + ".pdf")

const convertFunction: (  ()=>Promise <void>)[] = [useCloudConvert, ConvertAPI];

export async function POST(req: NextRequest) {
  const body:OfficeToPDFProps = await req.json();

  saveArrayBufferToFile(body.arrayBuffer);

  for( let convert of convertFunction) {
      try {
        await convert();
        if(fs.existsSync(filePDFPath)){
          break;
        }
      } catch(err) {
        console.log("Erreur dans la conversion:" + err)
      }
  }


  if(fs.existsSync(filePDFPath)){
    return Response.json({
      arrayBuffer: await getPdfArrayBuffer(),
    });
  } else {
    return Response.error();
  }

}



async function saveArrayBufferToFile(arrayBuffer: ArrayBuffer) {
  const buffer = Buffer.from(arrayBuffer)

  fs.writeFile(filePath, buffer, err => {
    if (err) {
      console.error("Erreur lors de l'écriture du fichier :", err)
    } else {
      console.log(`Fichier ${FILE_NAME}${EXTENSION} créé avec succès !`)
    }
  })
}




async function getPdfArrayBuffer(): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {

    readFile(filePDFPath, (err, data) => {
      if (err) {
        console.error('Erreur lors de la lecture du fichier:', err)
        reject()
      }

      const pdfBlob = new Blob([data], { type: 'application/pdf' })
      resolve(pdfBlob.arrayBuffer())
    })
  })
}

async function useCloudConvert() {
  if(!process.env.NEXT_PUBLIC_CLOUDCONVERT)
    return;

  const cloudConvert = new CloudConvert(process.env.NEXT_PUBLIC_CLOUDCONVERT);

  const job = await cloudConvert.jobs.create({
    tasks: {
      "import-File": {
          "operation": "import/upload"
      },
      "convert-file": {
          "operation": "convert",
          "input": [
              "import-File"
          ],
          "output_format": "pdf"
      },
      "export-file": {
          "operation": "export/url",
          "input": [
              "convert-file"
          ],
      }
  },
  });
  const uploadTaskId = job.tasks.filter(task => task.operation === 'import/upload')[0];
  await cloudConvert.tasks.upload(
    uploadTaskId,
    fs.createReadStream(filePath) );
  const completedJob = await cloudConvert.jobs.wait(job.id);
  const exportTask = completedJob.tasks.filter(task => task.operation === 'export/url')[0];

  if(exportTask.result?.files){
    const fileUrl = exportTask.result?.files[0].url
    const response = await axios({
      url: fileUrl,
      method: 'GET',
      responseType: 'stream' 
    });

    // Sauvegarder le fichier sur le disque
    const outputFile = fs.createWriteStream(filePDFPath);
    response.data.pipe(outputFile);
  }
}

async function ConvertAPI() {

}


