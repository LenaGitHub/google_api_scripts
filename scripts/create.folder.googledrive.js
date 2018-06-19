import {UploadService} from '@services';

class CreateFolderGoogleDrive {

    async start() {
        try {
            const createFolder = await UploadService.createParentFile('name-forder');
            process.exit(0);
        } catch (e) {
            console.log(e);
            process.exit(0);
        }
    }

    exit() {
        mongoose.disconnect();
    }
}

export default CreateFolderGoogleDrive;