# SCRIPT EM NODE JS PARA BACKUP DO CAPROVER

Script pessoal criado para gerar backup do caprover, ações realizadas:

- backup dos arquivos dos volumes captain
- backup dos bancos de dados (hoje suporta mongodb e mysql)
- zip de tudo
- upload para s3 da vultr


### Exemplo config.json

```json
{
  "folderPath": "/var/lib/docker/volumes/",
  "selectedFilesName": "captain",
  "dbs": [
    {
      "driver": "mysql",
      "host": "localhost",
      "port": "3306",
      "dbname": "",
      "user": "",
      "password": ""
    },
    {
      "driver": "mongodb",
      "uri": "mongodb://localhost:27017",
      "dbname": ""
    }
  ],
  "aws": {
    "endpoint": "",
    "secretKey": "",
    "accessKey": "",
    "bucket": ""
  }
}
```

### Uso

```shell script
npm install
chmod +x app.js
node app.js
```

### License
[MIT](https://choosealicense.com/licenses/mit/)