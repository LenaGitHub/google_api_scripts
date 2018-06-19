import mongoose from 'mongoose';
import {DetectChangesService, UploadService} from '@services';
import ms from '../server/services/ms';
import {Product} from '../server/models';
import fs from 'fs';

const parentId = process.env.GOOGLE_DRIVE_IMAGES;

(async () => {

    const exit = () => {
        mongoose.disconnect();
    };

    async function detect_changes() {
        try{
            const that = this;
            await checkForFile("scripts/startPageToken.json");
            const startPageToken = await getStartPageToken("scripts/startPageToken.json");
            const changes = await DetectChangesService.started(startPageToken);
            const newStartPageToken = changes.nextPageToken || changes.newStartPageToken;
            if (changes.items.length) {
                const applyChanges = await applyChangesProccess(0, changes.items);
            }
            await writeInFile("scripts/startPageToken.json", newStartPageToken);
            if (changes.nextPageToken){
                await detect_changes();
            }
        } catch (err) {
            let startPageToken = getStartPageToken("scripts/startPageToken.json");
            startPageToken = parseInt(startPageToken);
            startPageToken = startPageToken - 10;
            const changes = DetectChangesService.started(startPageToken);
            throw err;
        }
    }

    async function applyChangesProccess(index, changes) {
        console.log('[index]', index);
        if (index === changes.length) {
            return;
        }

        if (changes[index].id !== parentId) {
            //removed files
            if (changes[index].trashed) {
                if (changes[index].mimeType === 'application/vnd.google-apps.folder') {
                    const product = await Product.findOne({"article": changes[index].name});

                    if(typeof product !== 'undefined' && product !== null){
                        product.imagesStorage = [];
                        await product.save();
                    }

                }
                if (['image/png', 'image/jpeg'].indexOf(changes[index].mimeType) > -1 ) {
                    const parent = changes[index].parents[0];
                    const dataParent = await DetectChangesService.getFullFile(parent);
                    const article = dataParent.name;
                    await removeImgFromProduct(article, changes[index].id);
                }
            } else {
                //renamed folder
                if (changes[index].mimeType === 'application/vnd.google-apps.folder') {
                    const getFiles = await DetectChangesService.getChildSubfolders(changes[index].id);
                    const files = [];
                    await Object.keys(getFiles.files).forEach(key => {
                        if (['image/png', 'image/jpeg'].indexOf(getFiles.files[key].mimeType) > -1 ) files.push(getFiles.files[key]);
                    });

                    let items;
                    if(files.length > 0 && files[0].id){
                        items = await Product.find(
                            { $or:[
                                { imagesStorage : { $elemMatch : { id: files[0].id}}},
                                {'article':changes[index].name} ]
                            }
                        );
                    } else {
                        items = await Product.find(
                            {'article':changes[index].name}
                        );
                    }
                    if(typeof items !== 'undefined'){
                        if(items.length && items){
                            await eachProd(0, items, changes[index].name, files);
                        }
                    }
                }

                //changed images
                if (['image/png', 'image/jpeg'].indexOf(changes[index].mimeType) > -1 ) {
                    const parent = changes[index].parents[0];
                    const dataParent = await DetectChangesService.getFullFile(parent);

                    const items = await Product.find(
                        { $or:[
                            { imagesStorage : { $elemMatch : { id: changes[index].id}}},
                            {'article': dataParent.name} ]
                        }
                    );
                    if(items){
                        await eachImg(0, items, dataParent.name, changes[index].id, dataParent);
                    }
                }
            }
        };
        return applyChangesProccess(index + 1, changes)
    }

    async function removeImgFromProduct(article, ch_id) {
        const data = await Product.update(
            {article},
            {$pull: {
                imagesStorage: {id: ch_id}}
            }
        );
    }

    function getStartPageToken(file) {
        return new Promise((resolve, reject) => {
            fs.readFile(file, 'utf8', function (err, data) {
                if (err) reject(err);
                resolve(data);
            });
        });
    }

    function checkForFile(file){
        return new Promise((resolve, reject) => {
            fs.exists(file, function (exists) {
                if (!exists) {
                    fs.writeFile(file, '', (err) => {
                        if (err) reject(err);
                        resolve();
                    });
                } else {
                    resolve();
                }
            });
        });

    }

    function writeInFile(file, content) {
        return new Promise((resolve, reject) => {
            fs.writeFile(file, content, function (err) {
                if (err) reject(err);
                resolve();
            });
        });
    }

    function sort(a,b) {
        const x = a.name.toLowerCase();
        const y = b.name.toLowerCase();
        return x < y ? -1 : x > y ? 1 : 0;
    }

    async function eachProd(index, items, article, getFiles) {
        if(index === items.length) {
            return items;
        }

        if(items[index].article === article) {
            //save new images in new product
            items[index].imagesStorage = getFiles;
            if(typeof items[index].imagesStorage !== 'undefined') {
                await items[index].imagesStorage.sort(sort);
                await items[index].save();
            }
        } else {
            //clear imagesStorage
            items[index].imagesStorage = [];
            await items[index].save();
        }
        return eachProd(index + 1, items, article, getFiles);
    }

    async function eachImg(index, items, article, idRemoved, dataParent) {
        if(index === items.length) {
            return items;
        }

        if(items.length && items[index].article != article) {
            await removeImgFromProduct(items[index].article, idRemoved);
            return eachImg(index + 1, items, article, idRemoved, dataParent);
        }

        const getFiles = await DetectChangesService.getChildSubfolders(dataParent.id);

        const files = [];
        await Object.keys(getFiles.files).forEach(key => {
            if (['image/png', 'image/jpeg'].indexOf(getFiles.files[key].mimeType) > -1 ) files.push(getFiles.files[key]);
        });

        items[index].imagesStorage = files;
        if(typeof items[index].imagesStorage !== 'undefined') {
            await items[index].imagesStorage.sort();
            await items[index].save();
        }

        return eachImg(index + 1, items, article, idRemoved, dataParent);
    }

    //todo run import products
    try {
        await detect_changes();
        process.exit(0);
    } catch (e) {
        exit();
        console.log(e);
        process.exit(0);
    }
})();