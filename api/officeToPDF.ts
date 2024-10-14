
import fs, { readFile, unlink } from 'fs'

import path from 'path'

import CloudConvert from 'cloudconvert';

import ConvertAPI from 'convertapi';

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

const convertFunction: (()=>Promise <void>)[] = [useCloudConvert, useConvertAPI];

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
        continue;
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
      url: fileUrl,
      method: 'GET',
      responseType: 'stream' 
    });

    // Sauvegarder le fichier sur le disque
    const outputFile = fs.createWriteStream(filePDFPath);
    response.data.pipe(outputFile);
  }
}

async function useConvertAPI() {
  console.log("hello");
  const convertApi = new ConvertAPI("secret_fmmmSrfEBVKfJBgh");
  await convertApi.convert("pdf",{File: filePath},"docx").then(function(result) {result.saveFiles(FILE_PATH)})
}


