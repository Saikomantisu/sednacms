---

title: Media and uploads
description: Organise media in folders, configure UploadThing or S3 storage, and process images.
---

Configure one storage adapter in `astro.config.mjs`:

```js
import sedna, { uploadthingStorage } from 'sednacms';

// Inside defineConfig:
integrations: [sedna({ storage: uploadthingStorage() })],
```

Set `UPLOADTHING_TOKEN` from your UploadThing dashboard in your server's runtime
environment. The playground uses this adapter and loads the token from `.env`
during development. Restart the dev server after changing storage configuration.
The SDK handles upload signatures and verifies provider callbacks at
`/api/cms/uploads`. Uploads finish without waiting for the callback, so local
development does not require a public tunnel.

To use S3-compatible storage, import `s3Storage` from `sednacms` and set
`storage: s3Storage()`. Configure these environment variables:

```dotenv
SEDNA_S3_ENDPOINT=https://s3.example.com
SEDNA_S3_BUCKET=site-images
SEDNA_S3_KEY=your-access-key
SEDNA_S3_SECRET=your-secret-key
SEDNA_S3_REGION=auto
SEDNA_S3_PUBLIC_URL=https://images.example.com
```

For Amazon S3, use your bucket's region instead of `auto`. The bucket must allow
public reads through `SEDNA_S3_PUBLIC_URL`. This URL may include a path prefix.
Set it during builds as well as at runtime so Sedna can authorize the image host
for Astro's `<Image>`. UploadThing's `*.ufs.sh` image hosts are added automatically.
Configure your bucket's CORS rules for your site's exact origin, `PUT`, and the
`Content-Type` header, for example:

```json
[
  {
    "AllowedOrigins": ["https://your-site.example"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

Editors can upload JPEG, PNG, WebP, GIF, and AVIF images up to 32 MB. By default,
the browser resizes each static raster image to fit within 2560 × 2560 pixels,
converts it to WebP at 80% quality, then uploads it directly to storage. It keeps the original
proportions and never enlarges images. Saved dimensions describe the processed image.

WebP and AVIF preserve transparency; JPG uses a white background. GIF uploads
keep their original bytes and animation. For other raster formats, processing
removes embedded metadata and can turn animations into still images.

Processing uses jSquash's resize and WebP, MozJPEG, and AVIF WebAssembly codecs
in a browser worker. When you upload a file, the browser downloads
the selected encoder and, if needed, the resizer from your site. The image stays
in the browser during conversion. Processing times out after two minutes with an error.
If your site has a Content Security Policy, allow same-origin workers and
WebAssembly compilation, for example `worker-src 'self'` and
`script-src 'self' 'wasm-unsafe-eval'` alongside your existing directives.

Both adapters accept image settings:

```js
uploadthingStorage({
  image: { format: 'avif', quality: 0.85, maxWidth: 1920, maxHeight: 1920 },
});
s3Storage({ image: { format: 'jpg', quality: 0.9 } });
s3Storage({ image: false }); // Keep original files and animations.
```

`format` accepts `'webp'`, `'jpg'`, or `'avif'`. Quality is between 0 and 1 for all
formats, so `0.85` means 85%. Each encoder interprets quality
differently. The same value can produce different visual quality and file sizes
across formats.
Dimensions must be integers between 1 and 16384. Restart the dev server after
changing these settings.
These settings apply to new admin uploads and leave existing images and pasted
URLs unchanged. Processing runs in the admin browser; upload signing endpoints do
not enforce the image dimensions or output format.

For raster images and videos, the CMS signs uploads using file descriptors.
The browser sends the file contents directly to storage. For SVGs, the server
sanitises the file before uploading it to storage. Signing requires a session and a matching `Origin`. S3 signatures bind
the file size and content type and expire in five minutes.

The image field shows a preview and a progress bar for preparation, upload, and
finishing. Replacing a file keeps its image description. The field saves
`{ src, width, height, alt }` with the entry.
Removing an image clears the field. It does not delete the stored file, since
other entries may use it. Discarded entries can also leave unused files in storage.

## Media library

Open **Media** in the dashboard to browse folders. Uploads from the library root
or from image fields go into **Uncategorized** by default.
Open a folder to browse its files; use the breadcrumb to return to the library.
Create or rename folders in a dialog, and open a file's details to move it.
Folders are one level deep. Changes to folders update the database without
changing file URLs. File lists show 48 items per page.

You can upload these formats to Media:

- JPEG, PNG, WebP, GIF, and AVIF, up to 32 MB per file.
- MP4 and WebM videos, up to 100 MB per file.
- SVG, up to 1 MB per file.

Sedna rejects documents, audio, archives, and HTML. It checks limits before
signing and registering uploads. The storage provider also enforces the signed
upload size for raster images and videos. GIFs retain their animation and bypass image conversion.

SVG uploads use a separate authenticated server endpoint. The server reads at most
1 MB, parses XML with external resources and scripts disabled, and sanitises a
restricted set of static SVG elements with DOMPurify and jsdom. It removes scripts,
event handlers, HTML, styles, animation elements, embedded images and external
references, and keeps shapes, text, local gradients, clipping, and masks.
It rejects malformed XML, DTDs, custom entities, excessive nesting and complexity.
SVGs must provide pixel dimensions or a valid `viewBox`, up to 16384 pixels per axis.
Only the sanitised bytes go to storage. SVG registration requires a server-signed
receipt; the normal direct-upload endpoints do not issue SVG upload signatures.

Use storage on a separate public origin. All library files are public, including
SVGs. SVG sanitisation removes unsupported features, so check the resulting image
if the original uses styles or embedded resources.

Search by filename and press Enter, filter by image or video, or switch between grid
and list views. Search at the root covers all folders. Upload status appears in a
compact panel with each file's name, progress, completion, or error.

Use **Choose from media** in an image field to reuse an uploaded image; the picker
shows only images, including sanitised SVGs. Selecting or replacing an image
preserves that field's description.

Pasted image URLs stay external. Sedna does not download them, copy them to storage,
or add them to Media. Importing files from URLs is not available yet.
Uploads made before the library was introduced are not automatically indexed.
Their existing content URLs continue to work.

The library records a file after its upload succeeds. If recording fails, the
uploaded file remains in storage and the editor receives an error. Removing an
image from content does not remove it from the library or storage.

To delete a file, open its details in the library and choose **Delete**.
After you confirm, Sedna deletes the file from the configured storage and removes
its library record. Content using that file may break because Sedna leaves its
URLs unchanged. If storage deletion fails, the library record stays so you can
retry. S3 credentials need `s3:DeleteObject`
permission for dashboard deletion.

Media and folder tables are created automatically on the first authenticated
library request. The disposable browser demo keeps its existing local image
upload flow and does not include the media library.
