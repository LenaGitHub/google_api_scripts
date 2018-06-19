import {auth, drive} from 'googleapis';
import  fs from 'fs';
import request from 'request';

import {UploadService} from '@services';

const pageSizeFetchChanges = 10;

export default class DetectChangesService {
    constructor(props) {
        this.key = props.key;
        this.drive = drive('v3');
        this.driveV2 = drive('v2');
        this.jwtClient = new auth.JWT(
            this.key.client_email,
            null,
            this.key.private_key,
            ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.appdata', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.metadata', 'https://www.googleapis.com/auth/drive.metadata.readonly', 'https://www.googleapis.com/auth/drive.photos.readonly', 'https://www.googleapis.com/auth/drive.readonly'],
        );
        this.parentId = process.env.GOOGLE_DRIVE_IMAGES;
    }
    async started(startPageToken){
        try{
            const that = this;
            const checkPageToken = await this.checkPageTokenProccess(startPageToken);
            return (checkPageToken);
        } catch(err) {
            throw err;
        }
    }

    async checkPageTokenProccess(startPageToken) {
        try{
            let getChanges;
            if (startPageToken) {
                getChanges = await this.fetchChanges(startPageToken, this.fetchChanges);
            } else {
                getChanges = await this.getPageToken();
            }
            return(getChanges);
        } catch(err) {
            throw err;
        }
    }


    async getPageToken() {
        const that = this;
        return new Promise((resolve, reject) => {
            let startPageToken;
            this.drive.changes.getStartPageToken({
                fileId: this.parentId,
                auth: this.jwtClient
            }, async function (err, res) {
                if (err) return reject(err);
                startPageToken = res.startPageToken;
                const changes = await that.fetchChanges(startPageToken, that.fetchChanges);
                resolve(changes);
            });
        });
    }

    async fetchChanges(pageToken, pageFn) {
        const that = this;
        return new Promise((resolve, reject) => {
            this.drive.changes.list({
                auth: this.jwtClient,
                pageToken: pageToken,
                includeRemoved: true,
                restrictToMyDrive: false,
                pageSize: pageSizeFetchChanges,
                field: '*'
            }, async (err, res) => {
                if (err) return reject(err);
                console.log('res fetch changes', res)
                let changesItems = {};
                changesItems.items = [];
                if(res.changes.length){
                    let arCh = [];
                    changesItems.items = await that.eachChanges(0, res.changes, arCh);
                }
                if (res.newStartPageToken) {
                    changesItems.newStartPageToken = res.newStartPageToken;
                }
                if (res.nextPageToken) {
                    changesItems.nextPageToken = res.nextPageToken;
                    // pageFn(res.nextPageToken, pageFn);
                }
                resolve(changesItems);
            });
        });
    }

    async eachChanges(index, changes, arCh) {
        const that = this;
        if(index === changes.length) {
            return arCh;
        }
        if(changes[index].fileId != this.parentId ) {
            const ch_item = await that.getFullFile(changes[index].fileId);
            arCh.push(ch_item);
        };
        return this.eachChanges(index + 1, changes, arCh);
    }

    async getFullFile(id){
        return new Promise((resolve, reject) => {
            this.drive.files.get({
                fileId: id,
                auth: this.jwtClient,
                fields: '*'
            }, (err, res) => {
                err && reject(err);
                resolve(res);
            });
        })
    }

    getChild(){
        return new Promise((resolve, reject) => {
            this.drive.files.list({
                auth: this.jwtClient,
                q: `'${this.parentId}' in parents`,
                fields: "nextPageToken, files(id, name)",
                pageSize: 1000,
            }, (err, files) => {
                err && reject(err);
                resolve(files);
            });
        })
    }

    getChildSubfolders(id){
        return new Promise((resolve, reject) => {
            this.drive.files.list({
                auth: this.jwtClient,
                q: `'${id}' in parents`,
                fields: "nextPageToken, files(id, name, mimeType)",
                pageSize: 1000,
            }, (err, files) => {
                err && reject(err);
                resolve(files);
            });
        })
    }
}
