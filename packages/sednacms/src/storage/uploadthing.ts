import {
  createRouteHandler,
  createUploadthing,
  type FileRouter,
  UploadThingError,
  UTApi,
} from 'uploadthing/server';
import { MEDIA_TYPES, maxMediaBytes, RASTER_IMAGE_TYPES, SVG_TYPE } from './config.js';

export type UploadthingRouter = {
  image: FileRouter[string];
  media: FileRouter[string];
};

function createImageRouter(authorize: (request: Request) => Promise<void>): UploadthingRouter {
  const f = createUploadthing();
  const route = (types: string[]) =>
    f(
      Object.fromEntries(
        types.map((type) => [
          type,
          { maxFileSize: type.startsWith('video/') ? '100MB' : '32MB', maxFileCount: 1 },
        ]),
      ),
      {
        awaitServerData: false,
        presignedURLTTL: '5m',
      },
    )
      .middleware(async ({ req, files }) => {
        await authorize(req);
        if (
          files.length !== 1 ||
          !types.includes(files[0].type) ||
          files[0].size < 1 ||
          files[0].size > maxMediaBytes(files[0].type)
        )
          throw new UploadThingError({
            code: 'BAD_REQUEST',
            message: 'Choose one supported file.',
          });
        return {};
      })
      .onUploadComplete(() => {});
  return {
    image: route(RASTER_IMAGE_TYPES),
    media: route(MEDIA_TYPES.filter((type) => type !== SVG_TYPE)),
  };
}

export async function storeUploadthingSvg(svg: string, name: string) {
  const result = await new UTApi().uploadFiles(new File([svg], name, { type: SVG_TYPE }));
  if (result.error || !result.data) throw new Error('SVG storage unavailable.');
  return result.data.ufsUrl;
}

export async function deleteUploadthingFile(key: string) {
  const result = await new UTApi().deleteFiles(key, { keyType: 'fileKey' });
  if (!result.success) throw new Error('File deletion failed.');
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
