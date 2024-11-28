import express from "express";
import path from "path";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import docusign from "docusign-esign";
import fs from "fs";
import session from "express-session";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Configurar dotenv para cargar variables de entorno
dotenv.config();

// Configurar __dirname y __filename en ES6
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// file deepcode ignore UseCsurfForExpress: <please specify a reason of ignoring this>
// deepcode ignore DisablePoweredBy: <please specify a reason of ignoring this>
const app = express();

// console.log("NODE_PORT: ", process.env.NODE_PORT)
// console.log("NODE_SESSION_SECRET: ", process.env.NODE_SESSION_SECRET)
// console.log("DOCU_INTEGRATION_KEY: ", process.env.DOCU_INTEGRATION_KEY)
// console.log("DOCU_CLIENT_SECRET: ", process.env.DOCU_CLIENT_SECRET)
// console.log("DOCU_BASE_PATH: ", process.env.DOCU_BASE_PATH)
// console.log("DOCU_API_ACCOUNT_ID: ", process.env.DOCU_API_ACCOUNT_ID)
// console.log("DOCU_TEMPLATE_ID: ", process.env.DOCU_TEMPLATE_ID)
// console.log("DOCU_CLIENT_USER_ID: ", process.env.DOCU_CLIENT_USER_ID)
// console.log("DOCU_USER_ID: ", process.env.DOCU_USER_ID)
// const file = fs.readFileSync(path.join(__dirname, "private.key"))
// console.log("private.key: ", file.length)

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(
  session({
    secret: process.env.NODE_SESSION_SECRET,
    resave: true,
    saveUninitialized: true,
  })
);

function makeRecipientViewRequest(name, email) {
  // Data for this method
  // args.dsReturnUrl
  // args.signerEmail
  // args.signerName
  // args.signerClientId
  // args.dsPingUrl

  let viewRequest = new docusign.RecipientViewRequest();

  // Set the url where you want the recipient to go once they are done signing
  // should typically be a callback route somewhere in your app.
  // The query parameter is included as an example of how
  // to save/recover state information during the redirect to
  // the DocuSign signing. It's usually better to use
  // the session mechanism of your web framework. Query parameters
  // can be changed/spoofed very easily.
  viewRequest.returnUrl = "http://localhost:3000/success";

  // How has your app authenticated the user? In addition to your app's
  // authentication, you can include authenticate steps from DocuSign.
  // Eg, SMS authentication
  viewRequest.authenticationMethod = "none";

  // Recipient information must match embedded recipient info
  // we used to create the envelope.
  viewRequest.email = email;
  viewRequest.userName = name;
  viewRequest.clientUserId = process.env.DOCU_CLIENT_USER_ID;

  // DocuSign recommends that you redirect to DocuSign for the
  // embedded signing. There are multiple ways to save state.
  // To maintain your application's session, use the pingUrl
  // parameter. It causes the DocuSign signing web page
  // (not the DocuSign server) to send pings via AJAX to your
  // app,
  // viewRequest.pingFrequency = 600; // seconds
  // NOTE: The pings will only be sent if the pingUrl is an https address
  // viewRequest.pingUrl = args.dsPingUrl; // optional setting

  return viewRequest;
}

app.post("/form", async (_req, res) => {
    console.log("receive form data", _req.body);
    await CheckToken(_req);
  
    const { name, email } = _req.body;
  
    let envelopeApi = GetEnvelopesAPI(_req);
    let results = null;
  
    let envelope = MakeEnvelope(email, name);
  
    try {
      results = await envelopeApi.createEnvelope(
        process.env.DOCU_API_ACCOUNT_ID,
        {
          envelopeDefinition: envelope,
        }
      );
  
      console.log("envelope results ", results);
    } catch (error) {
      console.log("Error on createEnvelope:", error);
      res.status(500).send("Error creating envelope");
      return;
    }
  
    let viewResults = null;
  
    try {
      let viewRequest = makeRecipientViewRequest(name, email);
      viewResults = await envelopeApi.createRecipientView(
        process.env.DOCU_API_ACCOUNT_ID,
        results.envelopeId,
        { recipientViewRequest: viewRequest }
      );
  
      console.log("recipient view results ", viewResults);
    } catch (error) {
      console.log("Error on createRecipientView:", error);
      res.status(500).send("Error creating recipient view");
      return;
    }
  
    // Enviar el envelopeId y la URL de redirección en la respuesta
    res.json({
      envelopeId: results.envelopeId,
      redirectUrl: viewResults.url
    });
  });
  

function GetEnvelopesAPI(_req) {
  let dsApiClient = new docusign.ApiClient();
  dsApiClient.setBasePath(process.env.DOCU_BASE_PATH);
  dsApiClient.addDefaultHeader(
    "Authorization",
    "Bearer " + _req.session.access_token
  );
  return new docusign.EnvelopesApi(dsApiClient);
}

app.get("/listStatus", async (_req, res) => {
  await CheckToken(_req);

  let envelopeApi = GetEnvelopesAPI(_req);
  const envelopeId = _req.query.envelopeId; // Obtener el envelopeId como parámetro de consulta

  if (!envelopeId) {
    res.status(400).send("envelopeId query parameter is required");
    return;
  }

  try {
    const results = await envelopeApi.getEnvelope(
      process.env.DOCU_API_ACCOUNT_ID,
      envelopeId
    );
    res.json(results);
  } catch (error) {
    console.error("Error getting envelope status:", error);
    res.status(500).send("Error getting envelope status");
  }
});

app.get("/listStatusChanges", async (_req, res) => {
  await CheckToken(_req);

  let envelopeApi = GetEnvelopesAPI(_req);
  const fromDate = _req.query.fromDate;
  const toDate = _req.query.toDate;

  if (!fromDate || !toDate) {
    res.status(400).send("fromDate and toDate query parameters are required");
    return;
  }

  const options = {
    fromDate: fromDate,
    toDate: toDate,
    status: "sent,delivered,completed",
  };

  try {
    const results = await envelopeApi.listStatusChanges(
      process.env.DOCU_API_ACCOUNT_ID,
      options
    );
    res.json(results);
  } catch (error) {
    console.error("Error getting envelope status changes:", error);
    res.status(500).send("Error getting envelope status changes");
  }
});

function MakeEnvelope(email, name) {
  // Data for this method
  // args.signerEmail
  // args.signerName
  // args.signerClientId
  // docFile

  // document 1 (pdf) has tag /sn1/
  //
  // The envelope has one recipients.
  // recipient 1 - signer

  let docPdfBytes;
  // read file from a local directory
  // The read could raise an exception if the file is not available!
  docPdfBytes = fs.readFileSync(path.join(__dirname, "../MorseDocusSign.pdf"));

  // create the envelope definition
  let env = new docusign.EnvelopeDefinition();
  env.emailSubject = "Please sign this document";

  // add the documents
  let doc1 = new docusign.Document();
  let doc1b64 = Buffer.from(docPdfBytes).toString("base64");
  doc1.documentBase64 = doc1b64;
  doc1.name = "signed_file"; // can be different from actual file name
  doc1.fileExtension = "pdf";
  doc1.documentId = "3";

  // The order in the docs array determines the order in the envelope
  env.documents = [doc1];

  // Create a signer recipient to sign the document, identified by name and email
  // We set the clientUserId to enable embedded signing for the recipient
  // We're setting the parameters via the object creation
  let signer1 = docusign.Signer.constructFromObject({
    email: email,
    name: name,
    clientUserId: process.env.DOCU_CLIENT_USER_ID,
    recipientId: 1,
  });

  // Create signHere fields (also known as tabs) on the documents,
  // We're using anchor (autoPlace) positioning
  //
  // The DocuSign platform seaches throughout your envelope's
  // documents for matching anchor strings.
  let signHere1 = docusign.SignHere.constructFromObject({
    anchorString: "/sn1/",
    anchorYOffset: "10",
    anchorUnits: "pixels",
    anchorXOffset: "20",
  });
  // Tabs are set per recipient / signer
  let signer1Tabs = docusign.Tabs.constructFromObject({
    signHereTabs: [signHere1],
  });
  signer1.tabs = signer1Tabs;

  // Add the recipient to the envelope object
  let recipients = docusign.Recipients.constructFromObject({
    signers: [signer1],
  });
  env.recipients = recipients;

  // Request that the envelope be sent by setting |status| to "sent".
  // To request that the envelope be created as a draft, set to "created"
  env.status = "sent";

  return env;
}

async function CheckToken(_req) {
  if (_req.session.access_token && Date.now() < _req.session.expires_at) {
    console.log("re-using acess_token", _req.session.access_token);
  } else {
    console.log("renerating a new access token");
    let dsApiClient = new docusign.ApiClient();
    dsApiClient.setBasePath(process.env.DOCU_BASE_PATH);

    try {
      const results = await dsApiClient.requestJWTUserToken(
        process.env.DOCU_INTEGRATION_KEY,
        process.env.DOCU_USER_ID,
        "signature",
        fs.readFileSync(path.join(__dirname, "../private.dev.key")),
        10 * 60 // 60*60 seconds
      );
      _req.session.access_token = results.body.access_token;
      _req.session.expires_at =
        Date.now() + (results.body.expires_in - 60) * 1000;
    } catch (error) {
      console.log(error);
    }
  }
}

app.get("/", async (_req, res) => {
    await CheckToken(_req);
    
    res.send(
      `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Document</title>
            <style>
                form input {
                    display: block;
                }
            </style>
        </head>
        <body>
            <form action="/form" method="post">
                <label for="name">Name</label>
                <input id="name" name="name" type="text" required>
                <label for="email">Email</label>
                <input id="email" name="email" type="email" required>
                <label for="company">Company</label>
                <input id="company" name="company" type="text">
                <button type="submit">Submit</button>
            </form>
            <form action="/listStatus" method="get">
                <label for="envelopeId">Envelope ID</label>
                <input id="envelopeId" name="envelopeId" type="text" required>
                <button type="submit">Check Status</button>
            </form>
            <form action="/listStatusChanges" method="get">
                <label for="fromDate">From Date</label>
                <input id="fromDate" name="fromDate" type="date" required>
                <label for="toDate">To Date</label>
                <input id="toDate" name="toDate" type="date" required>
                <button type="submit">Check Status Changes</button>
            </form>
        </body>
        </html>
      `
    );
  });
  

app.get("/success", (_request, resposne) => {
  resposne.send("Success");
});

export default app;
