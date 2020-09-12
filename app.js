const config = require('./config.json')
const fs = require('fs');
const path = require('path');
const {zip} = require('zip-a-folder');
const moment = require('moment');
const {promisify} = require('util');
const mysqldump = require('mysqldump');
const uuid = require('uuid').v1;
const AWS = require('aws-sdk');
const MongoClient = require('mongodb').MongoClient;

const readDirPromise = promisify(fs.readdir);
const backupDir = path.join(__dirname, 'backups', 'BACKUP_' + moment().format('YYYY_MM_DD__hh_mm'));
const dbBackupDir = path.join(backupDir, 'dbs');

const createBackupDir = () => {
    if (!fs.existsSync(path.join(__dirname, 'backups'))) {
        fs.mkdirSync(path.join(__dirname, 'backups'));
    }

    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }

    if (!fs.existsSync(dbBackupDir)) {
        fs.mkdirSync(dbBackupDir);
    }
}

const readDirAndFilter = async (dirPath, filterFilenameContains) => {
    const dirFiles = await readDirPromise(dirPath);
    return dirFiles.filter(item => item.indexOf(filterFilenameContains) !== -1);
}

const zipDataFolders = async (files) => {
    const zippingPromises = files.map(async (file) => await zipAndMoveToBackupDir(file));
    await Promise.all(zippingPromises);
}

const zipAndMoveToBackupDir = async (folderPath) => {
    const dirPathToBackupPath = path.join(config.folderPath, folderPath);
    const zippedPath = path.join(backupDir, `${folderPath}.zip`);
    await zip(dirPathToBackupPath, zippedPath);
}

const backupDatabases = async () => {
    const backupPromises = config.dbs.map(async (dbConfig) => {
        if (dbConfig.driver === 'mysql') {
            await backupMysqlDatabase(dbConfig);
        }
        if (dbConfig.driver === 'mongodb') {
            await backupMongoDbDatabase(dbConfig);
        }
    })
    await Promise.all(backupPromises);
}

const backupMysqlDatabase = async (dbConfig) => {
    const dbBackupPath = path.join(dbBackupDir, `${dbConfig.dbname}-${uuid()}.sql.gz`);

    await mysqldump({
        connection: {
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password,
            database: dbConfig.dbname,
            port: dbConfig.port
        },
        dumpToFile: dbBackupPath,
        compressFile: true
    })
}

const backupMongoDbDatabase = async (dbConfig) => {
    const backupFolder = path.join(__dirname, dbConfig.dbname)
    fs.mkdirSync(backupFolder);

    const client = new MongoClient(dbConfig.uri, {useUnifiedTopology: true});
    const connectedInstance = await client.connect();
    const collections = await connectedInstance.db(dbConfig.dbname).listCollections().toArray();

    const writeFilePromise = promisify(fs.writeFile);

    const collectionsPromise = collections.map(async (collection) => {
        const data = await connectedInstance.db(dbConfig.dbname).collection(collection.name).find({}).toArray();
        await writeFilePromise(path.join(backupFolder, `${collection.name}.json`), JSON.stringify(data));
    })

    await Promise.all(collectionsPromise);

    await zip(backupFolder, path.join(dbBackupDir, `${dbConfig.dbname}-${uuid()}.zip`));

    await fs.rmdirSync(backupFolder, {recursive: true});

    await connectedInstance.close();

}

const zipBackupDir = async () => {
    const zippedFileName = backupDir.split('/').pop() + '.zip';
    const zippedFilePath = path.join(__dirname, zippedFileName);
    await zip(backupDir, zippedFilePath);
    return {name: zippedFileName, path: zippedFilePath};
}

const uploadToAws = (fileName, filePath) => {
    return new Promise((resolve, reject) => {
        const awsEndpoint = new AWS.Endpoint(config.aws.endpoint);
        const s3 = new AWS.S3({
            endpoint: awsEndpoint,
            accessKeyId: config.aws.accessKey,
            secretAccessKey: config.aws.secretKey
        })

        const params = {
            Body: fs.createReadStream(filePath),
            Bucket: config.aws.bucket,
            Key: fileName,
            ACL: 'private'
        }

        s3.putObject(params, (err, data) => {
            if (err) {
                console.log(err);
                reject(err);
                return;
            }

            resolve();
        });
    });
}

const cleanFolders = async (zippedBackup) => {
    fs.rmdirSync(path.join(__dirname, 'backups'), {recursive: true});
    fs.unlinkSync(zippedBackup);
}

(async () => {
    try {
        await createBackupDir();
        const foldersToBackup = await readDirAndFilter(config.folderPath, config.selectedFilesName);
        await zipDataFolders(foldersToBackup);
        await backupDatabases();
        const {name, path} = await zipBackupDir();
        await uploadToAws(name, path);
        await cleanFolders(path);
    } catch (e) {
        console.error(e);
    }
})()