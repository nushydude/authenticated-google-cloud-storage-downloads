const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const { Storage } = require('@google-cloud/storage');

// google storage setup
const storage = new Storage({
  projectId: process.env.GCP_STORAGE_PROJECT_ID,
  credentials: {
    private_key: Buffer.from(process.env.GCP_STORAGE_PRIVATE_KEY, 'base64'),
    client_email: process.env.GCP_STORAGE_CLIENT_EMAIL,
  },
});

const bucket = storage.bucket(process.env.GCP_STORAGE_BUCKET_ID);

const app = express();

app.use(cors());
app.use(bodyParser.json());

app.get('/asset/:filename', async (req, res) => {
  // add authentication here

  const filename = req.params.filename;

  if (typeof filename !== 'string') {
    return res.sendStatus(400);
  }

  console.log(`fetching ${filename}`);

  // get the file from bucket
  const remoteFile = bucket.file(filename);

  // check if the file exists
  try {
    const [exists] = await remoteFile.exists();

    if (!exists) {
      return res.sendStatus(404);
    }
  } catch (error) {
    // unknown error
    return res.sendStatus(500);
  }

  // designate as no store
  res.setHeader('cache-control', 'no-store');

  try {
    // get the content type of the file
    const [metadata, apiResponse] = await remoteFile.getMetadata();

    res.setHeader('content-type', metadata.contentType);
  } catch (error) {
    return res.sendStatus(500);
  }

  // stream the file to the client
  remoteFile
    .createReadStream()
    .on('error', function(err) {})
    .on('response', function(response) {})
    .on('end', function() {})
    .pipe(res);
});

app.listen(3001, () => console.log('Server listening http://localhost:3001'));
