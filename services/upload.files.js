import {auth, drive} from 'googleapis';
import  fs from 'fs';
import request from 'request';

export default class UploadFilesService {
    constructor(props) {
        this.key = props.key;
        this.drive = drive('v3');
        this.driveV2 = drive('v2');
        this.jwtClient = new auth.JWT(
            this.key.client_email,
            null,
            this.key.private_key,
            ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.appdata'],
            null
        );
        this.parentId = process.env.GOOGLE_DRIVE_IMAGES;
    }

    async arrayList(item){
        try{
            let product_code = item.article;
            const arr = item.pictures;
            if (arr.length > 0 && product_code) {
                let images = arr.map(async (image) => {
                    const data = await this.processRequest(image, product_code);
                    return data;
                });
                images = await Promise.all(images);
                return images;
            }
            return [];
        } catch(err) {
            throw err;
        }
    }

    async processRequest(image, product_code){
        const getImage = (image) => new Promise((resolve, reject) => {
            request(image, {
                auth: {
                    user: process.env.MOYSKLAD_LOGIN,
                    pass: process.env.MOYSKLAD_PASS,
                },
                encoding: null
            }, (err, res, body) => {
                if(err) return reject(err);
                let name;
                if (res.headers['content-disposition']) {
                    const regexp = /filename="(.+)"/;
                    const nameArr = res.headers['content-disposition'].match(regexp);
                    name = nameArr[1];
                } else {
                    name = this.randomString();
                }
                resolve({
                    name,
                    body
                })
            })
        });
        const {body, name} = await getImage(image);
        return await this.uploadFile(body, name, product_code);
    }

    async uploadFile(body, name, code_product, params = {}) {
        try {
            return await this.processGetUpload(body, name, code_product);
        } catch (err) {
            throw err;
        }
    }

    async processGetUpload(body, name, code_product) {
        await this.delay();
        const that = this;
        const images = await that.createFolder(code_product, that.parentId, name, body);
        return images;
    };

    async createFolder(code_product, id, name, body){
        return new Promise((resolve, reject) => {
            const that = this;
            that.drive.files.create({
                resource: {
                    'name': code_product,
                    'mimeType': 'application/vnd.google-apps.folder',
                    'parents': [id]
                },
                fields: 'id, name',
                auth: that.jwtClient
            }, async (err, item) => {
                if(err) reject(err);
                // that.updatePermissionFile(item.id);
                const uploadImagesRes = await that.uploadImage(name, item.id, code_product, body);
                resolve(uploadImagesRes);
            });
        });
    }

    async uploadImage(name, id, code_product, body){
        return new Promise((resolve, reject) => {
            const that = this;
            const fileMetadata = {
                name: name,
                parents: [id]
            };
            const media = {
                mimeType: 'image/jpeg',
                body: body
            };
            const processUploadImages = () => new Promise((resolve, reject) => {
                that.drive.files.create({
                    resource: fileMetadata,
                    media: media,
                    fields: 'id, name',
                    auth: that.jwtClient
                }, (err, image) => {
                    if (err) reject(err);
                    resolve(image);
                });
            });
            processUploadImages().then(resolve).catch(reject);
        })
    }



    clearItems(){
        return new Promise((resolve, reject) => {
            const that = this;
            this.drive.files.list({
                auth: this.jwtClient,
                fields: "nextPageToken, files(id, name, mimeType)"
            }, async (err, item) => {
                if (err) reject(err);
                let n;
                const items = item.files;
                await that.processClearItems(items, 0);
                resolve(item);
            });
        });
    }

    async processClearItems(items, index){
        console.log('[index]', index);
        if(index === items.length) {
            return;
        }
        if(items[index].id != this.parentId ) {
            await this.deleteFile(items[index].id);
        };
        return this.processClearItems(items, index + 1)
    }

    async deleteFile(id){
        return new Promise((resolve, reject) => {
            this.drive.files.delete({
                'fileId': id,
                auth: this.jwtClient
            }, (err) => {
                err && reject(err);
                resolve();
            });
        });
    }

    getListParent(parentId){
        return new Promise((result, reject) => {
            this.drive.files.list({
                auth: this.jwtClient,
                q: `'1lYcCsUGZWMDSbN1CbbLpw6Q0M-C5Plmd' in parents`,
                fields: "nextPageToken, files(id, name, mimeType)"
            }, (err, files) => {
                err && reject(err);
                result(files);
            });
        })
    }

    updatePermissionFile(id) {
        return new Promise((resolve, reject) => {
            const that = this;
            const permissions = [
                {
                    'type': 'user',
                    'role': 'writer',
                    'emailAddress': process.env.GOOGLE_DRIVE_PERMISSION
                }
            ];
            const result = permissions.map((permission) => {
                return new Promise((resolve, reject) => {
                    this.drive.permissions.create({
                        resource: permission,
                        fileId: id,
                        fields: 'id',
                        auth: this.jwtClient,
                        sendNotificationEmails: false,
                        transferOwnership: false
                    }, (err, updatedPermission) => {
                        if(err) reject(err);
                        resolve(updatedPermission);
                    });
                })
            });
            Promise.all(result).then(resolve).catch(reject);
        })
    }

    getFile(id){
        return new Promise((resolve, reject) => {
            this.drive.files.export({
                'fileId': id,
                sendNotificationEmail: false,
                alt: 'media',
                auth: this.jwtClient
            }, (err, updatedPermission) => {
                if(err) reject(err);
                resolve(updatedPermission);
            });
        });
    }

    getListFolders(){
        return new Promise((resolve, reject) => {
            this.drive.files.list({
                auth: this.jwtClient,
                q: `'${this.parentId}' in parents`,
                fields: "nextPageToken, files(id, name, mimeType)"
            }, (err, files) => {
                err && reject(err);
                resolve(files)
            });
        })
    }

    getChild(id, pageToken){
        return new Promise((resolve, reject) => {
            this.drive.files.list({
                auth: this.jwtClient,
                q: `'${id}' in parents`,
                fields: "nextPageToken, files(id, name, mimeType)",
                pageSize: 100,
                pageToken: pageToken
            }, (err, files) => {
                err && reject(err);
                resolve(files);
            });
        })
    }



    randomString() {
        var text = "";
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (var i = 0; i < 16; i++)
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
    }

    createParentFile(name){
        const that = this;
        return new Promise((resolve, reject) => {
            this.drive.files.create({
                resource: {
                    'name': name,
                    'mimeType': 'application/vnd.google-apps.folder'
                },
                fields: 'id, name',
                auth: this.jwtClient
            }, async (err, file) => {
                if (err) {
                    console.error(err);
                    reject();
                } else {
                    console.log('File Id: ', file.id);
                    await that.updatePermissionFile(file.id);
                    resolve(file);
                }
            });
        });
    }

    searchByName(article){
        return new Promise((resolve, reject) => {
            this.drive.files.list({
                auth: this.jwtClient,
                q: `name contains '${article}'`,
                fields: "nextPageToken, files(id, name)"
            }, (err, folder) => {
                err && reject(err);
                const folders = folder.files;
                if(folders){
                    this.drive.files.list({
                        auth: this.jwtClient,
                        q: `'${folders[0].id}' in parents`,
                        fields: "nextPageToken, files(id, name, mimeType)"
                    }, (err, images) => {
                        err && reject(err);
                        resolve(images);
                    });
                } else {
                    resolve();
                }
            });
        })
    }

    async delay() {
        return new Promise(resolve => setTimeout(resolve, 2000));
    }

}
