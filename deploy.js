import * as ftp from 'basic-ftp';
import dotenv from 'dotenv';
import { readdir, statSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';

dotenv.config();

const readdirAsync = promisify(readdir);

async function uploadDirectory(client, localDir, remoteDir) {
  const files = await readdirAsync(localDir);
  
  for (const file of files) {
    const localPath = join(localDir, file);
    const remotePath = join(remoteDir, file).replace(/\\/g, '/');
    
    if (statSync(localPath).isDirectory()) {
      await client.ensureDir(remotePath);
      await uploadDirectory(client, localPath, remotePath);
    } else {
      await client.uploadFrom(localPath, remotePath);
      console.log(`Uploaded: ${remotePath}`);
    }
  }
}

async function deploy() {
  const client = new ftp.Client();
  client.ftp.verbose = true;
  
  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      secure: false
    });
    
    console.log('FTP接続成功');
    
    await client.ensureDir(process.env.FTP_REMOTE_PATH);
    await uploadDirectory(client, './dist', process.env.FTP_REMOTE_PATH);
    
    console.log('デプロイ完了');
  } catch (err) {
    console.error('デプロイエラー:', err);
  } finally {
    client.close();
  }
}

deploy(); 