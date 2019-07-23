const { CloudRedisClient } = require('@google-cloud/redis');
const { Storage } = require('@google-cloud/storage');
const bodyParser = require('body-parser');
const cors = require('cors');
const express = require('express');
const fs = require('fs');
const helmet = require('helmet');
const Redis = require('ioredis');
const { RateLimiterRedis } = require('rate-limiter-flexible');
const redis = require('redis');

// rate limiting using a redis server (note: need to setup one.)
// eg: https://cloud.google.com/memorystore/docs/redis/creating-managing-instances
// https://googleapis.dev/nodejs/redis/latest/v1.CloudRedisClient.html
const redisClient = new Redis({ enableOfflineQueue: false });

const rateLimiterRedis = new RateLimiterRedis({
  storeClient: redisClient,
  points: 5000, // Number of points (initial Google Cloud Storage object read rate limit)
  duration: 1, // Per second
});

// rate limiting middleware
const rateLimiterMiddleware = (req, res, next) => {
  rateLimiterRedis
    .consume(req.ip)
    .then(() => {
      next();
    })
    .catch(_ => {
      res.status(429).send('Too Many Requests');
    });
};

// google storage setup
const storage = new Storage({
  projectId: process.env.GCP_STORAGE_PROJECT_ID,
  // use a service account that can only read files
  credentials: {
    private_key: Buffer.from(process.env.GCP_STORAGE_PRIVATE_KEY, 'base64'),
    client_email: process.env.GCP_STORAGE_CLIENT_EMAIL,
  },
});
// TODO: disable public access to the bucket
const bucket = storage.bucket(process.env.GCP_STORAGE_BUCKET_ID);

const app = express();

app.use(rateLimiterMiddleware);
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());

app.get('/asset/:filename', async (req, res) => {
  // TODO: do access control here (jwt verification, paid user etc.)

  const filename = req.params.filename;

  console.log(`Requested ${filename}`);

  // get the file from bucket
  const remoteFile = bucket.file(filename);

  // check if the file exists
  try {
    const [exists] = await remoteFile.exists();

    if (!exists) {
      console.log('The file does not exist');

      return res.status(404).send('The file does not exist');
    }
  } catch (error) {
    // unknown error
    console.error('Unknown error remoteFile.exists call:', error);

    return res.sendStatus(500);
  }

  // designate as no-store cache control policy
  console.log('Setting cache-control: no-store');

  res.setHeader('cache-control', 'no-store');

  try {
    // get the content type of the file
    const [metadata, apiResponse] = await remoteFile.getMetadata();

    console.log('Setting content-type:', metadata.contentType);

    res.setHeader('content-type', metadata.contentType);
  } catch (error) {
    console.error('Unknown error remoteFile.getMetadata call:', error);

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
