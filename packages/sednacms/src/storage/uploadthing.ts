import {
  createRouteHandler,
  createUploadthing,
  type FileRouter,
  UploadThingError,
} from 'uploadthing/server';
import { IMAGE_TYPES } from './config.js';

export type UploadthingRouter = {
  image: FileRouter[string];
};

function createImageRouter(authorize: (request: Request) => Promise<void>): UploadthingRouter {
  const f = createUploadthing();
  return {
    image: f(
      Object.fromEntries(
        IMAGE_TYPES.map((type) => [type, { maxFileSize: '32MB', maxFileCount: 1 }]),
      ),
      { awaitServerData: false, presignedURLTTL: '5m' },
    )
      .middleware(async ({ req, files }) => {
        await authorize(req);
        if (files.length !== 1 || !IMAGE_TYPES.includes(files[0].type) || files[0].size < 1)
          throw new UploadThingError({
            code: 'BAD_REQUEST',
            message: 'Choose one supported image.',
          });
        return {};
      })
      .onUploadComplete(() => {}),
  };
}

export function createUploadthingHandler(authorize: (request: Request) => Promise<void>) {
  return createRouteHandler({
    router: createImageRouter(authorize),
    config: {
      callbackUrl: new URL('/api/cms/uploads', process.env.SEDNA_URL).href,
      logLevel: 'Error',
    },
  });
}
