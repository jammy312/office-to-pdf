
import fs, { readFile, unlink } from 'fs'

import path from 'path'

import CloudConvert from 'cloudconvert';

import { NextRequest } from 'next/server'
import axios from 'axios';


interface OfficeToPDFProps{
  buffer:any
}


const FILE_NAME = "extension";
const FILE_PATH = "/tmp";
const EXTENSION = ".docx"
const filePath = path.join(FILE_PATH, FILE_NAME + EXTENSION)
const filePDFPath = path.join(FILE_PATH, FILE_NAME + ".pdf")

const convertFunction: (  ()=>Promise <void>)[] = [useCloudConvert, ConvertAPI];

export async function POST(req: NextRequest) {
  console.log("1")
  const body:OfficeToPDFProps = await req.json();
  const buffer = Buffer.from(body.buffer.data)
  console.log(buffer);
  console.log("2")

  await saveArrayBufferToFile(buffer);
  console.log("3")

  for( let convert of convertFunction) {
      try {
        await convert();
        if(fs.existsSync(filePDFPath)){
          console.log(`Fichier ${FILE_NAME}.pdf créé avec succès !`)
          break;
        }
      } catch(err) {
        console.log("Erreur dans la conversion: " + err)
      }
  }


  if(fs.existsSync(filePDFPath)){
    return Response.json({
      buffer: await getPdfBuffer(),
    });
  } else {
    return Response.error();
  }

}



async function saveArrayBufferToFile(buffer: Buffer) {

  fs.writeFile(filePath, buffer, err => {
    if (err) {
      console.error("Erreur lors de l'écriture du fichier :", err)
    } else {
      console.log(`Fichier ${FILE_NAME}${EXTENSION} créé avec succès !`)
    }
  })
}




async function getPdfBuffer(): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {

    readFile(filePDFPath, (err, data) => {
      if (err) {
        console.error('Erreur lors de la lecture du fichier:', err)
        reject()
      }

      resolve(data)
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
      url: "https://us-east.storage.cloudconvert.com/tasks/e73b7806-3d14-482f-bede-a3a6ed363e3c/extension.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=cloudconvert-production%2F20241014%2Fva%2Fs3%2Faws4_request&X-Amz-Date=20241014T194019Z&X-Amz-Expires=86400&X-Amz-Signature=926cebfe2c5b171cb059f0926839e0d68e46f07f9df68cc1145e416d4d8f7544&X-Amz-SignedHeaders=host&response-content-disposition=attachment%3B%20filename%3D%22extension.pdf%22&response-content-type=application%2Fpdf&x-id=GetObject",
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


