const fs = require('fs');
const {google} = require('googleapis');
const URL = require('./environment/env');
const request = require('request');

class Api {
  constructor() {
    this.SCOPES = ['https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/userinfo.profile'];
    this.TOKEN_PATH = 'token.json';
    this.AUTH = "";
    this.drive = "";
    this.oAuth2Client = "";
    this.token = {};

    this.authenticate = async (req, res) => {
      fs.readFile('./environment/credentials.json', async (err, content) => {
        const credentials = JSON.parse(content);
        const {client_secret, client_id, redirect_uris} = credentials.installed;
        this.oAuth2Client = new google.auth.OAuth2(
            client_id, client_secret, URL+redirect_uris[0]);
        this.authorize(req, res);
      });
    }

    this.authorize = async (req, res) => {
      const authUrl = this.oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: this.SCOPES,
      });
      res.send(authUrl);
    }
    
    this.getAccessToken = (req, res) => {
      console.log(req.query.code);
      this.oAuth2Client.getToken(req.query.code, (err, token) => {
        if (err) return console.error('Error retrieving access token', err);
        this.oAuth2Client.setCredentials(token);
        this.token = token;
        const auth = this.oAuth2Client;
        this.drive = google.drive({version: 'v3', auth });
        res.sendFile('./popup-close.html', {root: __dirname });
      });
    }

    this.popupClose = (req, res) => {
      res.send('./popup-close.html');
    }

    this.isAuthenticated = (req, res) => {
      if(this.drive != "") {
        const app = this;
        request('https://www.googleapis.com/oauth2/v3/tokeninfo?id_token='+app.token.id_token, (e, r, body) => {
          if(!e && r.statusCode == 200) {
            const id = JSON.parse(body).sub;
            res.send({ userId: id });
            app.token = "";
            fs.readFile('./workspace.json', async (err, data) => {
              if(err) {console.log(err)}
              else {
                const workspace = JSON.parse(data);
                const userWorkspace = await this.containsValue(workspace.users, id, false);
                if(!userWorkspace) {
                  workspace.users.push({ name: id, files: []});
                }
                const json = JSON.stringify(workspace);
                fs.writeFileSync('./workspace.json', json);
              }});
          }
        })
      }
    }

    this.upload = async (req, res) => {
      console.log(req);
        var fileMetadata = {
          'name': req.file.originalname
        };
        var media = {
          mimeType: req.file.mimetype,
          body: fs.createReadStream(`./uploads/${req.file.filename}`)
        };
        this.drive.files.create({
          resource: fileMetadata,
          media: media,
          fields: 'id'
        }, (err) => {
          if (err) { console.error(err); } 
          else {
            fs.readFile('./workspace.json', async (err, data) => {
              if(err) {console.log(err)}
              else {
                const workspace = JSON.parse(data);
                const userWorkspace = await this.containsValue(workspace.users, req.body.userId, false);
                userWorkspace.files.push({
                    "id": userWorkspace.files.length,
                    "name": req.file.originalname,
                    "x": 100,
                    "y": 100,
                    "text": ""
                  });
                this.update(workspace.users, req.body.userId, "files", userWorkspace.files);
                const json = JSON.stringify(workspace);
                fs.writeFileSync('./workspace.json', json);
                fs.unlinkSync(`./uploads/${req.file.filename}`);
                res.send();
              }
            });
          }
        });
    }
    
    this.uploadText = async (req, res) => {
      fs.readFile('./workspace.json', async (err, data) => {
        if(err) {console.log(err)}
        else {
          const workspace = JSON.parse(data);
          const userWorkspace = await this.containsValue(workspace.users, req.body.userId, false);
          userWorkspace.files.push({
              "id": userWorkspace.files.length,
              "name": "Заметка " + userWorkspace.files.length,
              "x": Math.floor(Math.random() * 1000)+100,
              "y": Math.floor(Math.random() * 400)+100,
              "text": ""
            });
          this.update(workspace.users, req.body.userId, "files", userWorkspace.files);
          const json = JSON.stringify(workspace);
          fs.writeFileSync('./workspace.json', json);
        }
      });
      res.send();
    }

    this.update = (arr, name, prop, value) => {
      const user = arr.find((u) => { return u.name === name });
      user[prop] = value;
    }

    this.getFiles = async (req, res) => { 
      const filesData = fs.readFileSync('./workspace.json');
      const workspace = JSON.parse(filesData);
      const filesToSend = [];
      this.drive.files.list({
        pageSize: 1000,
        fields: 'nextPageToken, files(id, name, thumbnailLink, webViewLink)',
        q: 
        `mimeType = 'application/vnd.google-apps.document' 
        or mimeType = 'application/pdf' 
        or mimeType = 'image/png' 
        or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'`
      }, async (err, response) => {
        if (err) return console.log('The API returned an error: ' + err);
        const files = await response.data.files;
        if (files.length) {
          let userWorkspace = await this.containsValue(workspace.users, req.query.userId, false);
          await files.map(async (file) => {
            let workspaceFile = await this.containsValue(userWorkspace.files, file.name, false);
            if (workspaceFile) {
              const fileToAdd = {
                "id": workspaceFile.id,
                "name": file.name,
                "thumbnailLink": file.thumbnailLink,
                "link": file.webViewLink,
                "x": workspaceFile.x,
                "y": workspaceFile.y,
                "text": workspaceFile.text
              }
              filesToSend.push(fileToAdd);
            }
          });

          let notes = await this.containsValue(userWorkspace.files, "Заметка", true);
          for (let i = 0; i < notes.length; i++) {
            const fileToAdd = {
              "id": notes[i].id,
              "name": notes[i].name,
              "thumbnailLink": "",
              "link": "",
              "x": notes[i].x,
              "y": notes[i].y,
              "text": notes[i].text
            }
            filesToSend.push(fileToAdd);
          }
          
          filesToSend.sort((a, b) => {
            return a.id - b.id;
          })
          console.log(filesToSend);
          res.send(filesToSend);
        } else {
          console.log('No files found.');
        }
      })
    }
    
    this.containsValue = (arr, value, include) => {
      if(!include) {
        for(let i = 0; i < arr.length; i++) {
          if(arr[i].name == value) {
            return arr[i];
          }
        }
      } else {
        let ta = [];
        for(let i = 0; i < arr.length; i++) {
          if(arr[i].name.includes(value)) {
            ta.push(arr[i]);
          }
        }
        return ta;
      }
      return;
    }

    this.save = async (req, res) => {
      const filesData = fs.readFileSync('./workspace.json');
      const workspace = JSON.parse(filesData);
      const userWorkspace = await this.containsValue(workspace.users, req.body.userId, false);

      for(let i = 0; i < req.body.filesPositions.length; i++) {
        for(let j = 0; j < userWorkspace.files.length; j++) {
          if(userWorkspace.files[j].name == req.body.filesPositions[i].name) {
            userWorkspace.files[j].x = req.body.filesPositions[i].x;
            userWorkspace.files[j].y = req.body.filesPositions[i].y;
            userWorkspace.files[j].text = req.body.filesPositions[i].text;
          }
        }
      }
      this.update(workspace.users, req.body.userId, "files", userWorkspace.files);
      const json = JSON.stringify(workspace);
      fs.writeFileSync('./workspace.json', json);

      res.send();
    }

    this.delete = async (req, res) => {
      const filesData = fs.readFileSync('./workspace.json');
      const workspace = JSON.parse(filesData);
      let userWorkspace = await this.containsValue(workspace.users, req.body.userId, false);

      userWorkspace.files = userWorkspace.files.map((file) => {
        if(file.id === req.body.fileId) {
          file.name = "null"
        }
        return file;
      });
      this.update(workspace.users, req.body.userId, "files", userWorkspace.files);

      const json = JSON.stringify(workspace);
      fs.writeFileSync('./workspace.json', json);
      res.send();
    }
  }
}

module.exports = Api;