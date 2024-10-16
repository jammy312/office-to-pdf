
import fs, { readFile, unlink } from 'fs'

import path from 'path'

import CloudConvert from 'cloudconvert';

import ConvertAPI from 'convertapi';

import { NextRequest } from 'next/server'
import axios from 'axios';

import {  ServicePrincipalCredentials,
  PDFServices,
  MimeType,
  CreatePDFJob,
  CreatePDFParams,
  CreatePDFResult,
  DocumentLanguage,
  SDKError,
  ServiceUsageError,
  ServiceApiError} from "@adobe/pdfservices-node-sdk"

interface OfficeToPDFProps{
  buffer:any
}


const FILE_NAME = "extension";
const FILE_PATH = "/tmp";
const EXTENSION = ".docx"
const filePath = path.join(FILE_PATH, FILE_NAME + EXTENSION)
const filePDFPath = path.join(FILE_PATH, FILE_NAME + ".pdf")

const convertFunction: (()=>Promise <void>)[] = [ useAdobeDeveloper];

export async function POST(req: NextRequest) {
  const body:OfficeToPDFProps = await req.json();
  const buffer = Buffer.from(body.buffer.data)
  console.log(buffer);
  await saveArrayBufferToFile(buffer);

  for( let convert of convertFunction) {
      try {
        await convert();
        if(fs.existsSync(filePDFPath)){
          console.log(`Fichier ${FILE_NAME}.pdf créé avec succès!`)
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
  if(!process.env.NEXT_PUBLIC_CONVERTAPI)
    return
  const convertApi = new ConvertAPI(process.env.NEXT_PUBLIC_CONVERTAPI);
  const result = await convertApi.convert("pdf",{File: filePath},"docx");

  await result.saveFiles(FILE_PATH);
}




async function useAdobeDeveloper() {
  let readStream;
  if(!process.env.PDF_SERVICES_CLIENT_ID || !process.env.PDF_SERVICES_CLIENT_SECRET)
    return;
  try {
  
      // Initial setup, create credentials instance
      const credentials = new ServicePrincipalCredentials({
          clientId:process.env.PDF_SERVICES_CLIENT_ID,
          clientSecret: process.env.PDF_SERVICES_CLIENT_SECRET
      });

      // Creates a PDF Services instance
      const pdfServices = new PDFServices({credentials});

      // Creates an asset(s) from source file(s) and upload
      readStream = fs.createReadStream(filePath);
      const inputAsset = await pdfServices.upload({
          readStream,
          mimeType: MimeType.DOCX
      });

      // Creates a new job instance
      const job = new CreatePDFJob({inputAsset});

      // Submit the job and get the job result
      const pollingURL = await pdfServices.submit({job});
      const pdfServicesResponse = await pdfServices.getJobResult({
          pollingURL,
          resultType: CreatePDFResult
      });

      // Get content from the resulting asset(s)
      const resultAsset = pdfServicesResponse.result?.asset;
      if(resultAsset){
        const streamAsset = await pdfServices.getContent({asset: resultAsset});

        // Creates an output stream and copy result asset's content to it
        const outputFilePath = filePDFPath;
        console.log(`Saving asset at ${outputFilePath}`);

        const outputStream = fs.createWriteStream(outputFilePath);
        streamAsset.readStream.pipe(outputStream);
      }
  } catch (err) {
      if (err instanceof SDKError || err instanceof ServiceUsageError || err instanceof ServiceApiError) {
          console.log("Exception encountered while executing operation", err);
      } else {
          console.log("Exception encountered while executing operation", err);
      }
  } finally {
      readStream?.destroy();
  }
}