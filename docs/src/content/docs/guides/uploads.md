---

title: Image uploads
description: Configure UploadThing or S3 storage and browser image processing.
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
the browser resizes each image to fit within 2560 × 2560 pixels and converts it to
WebP at 80% quality before uploading directly to storage. It keeps the original
proportions and never enlarges images. Saved dimensions describe the processed image.

WebP and AVIF preserve transparency. JPG uses a white background. Processing turns
animated images into still images and removes embedded metadata.

Processing uses jSquash's resize and WebP, MozJPEG, and AVIF WebAssembly codecs
in a browser worker. On upload, the browser downloads
the selected encoder and the resizer if needed. The site serves these assets locally; no conversion
service receives the image. Processing times out after two minutes with an error.
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
These settings apply to new admin uploads. Existing images and pasted URLs stay
as they are. Processing runs in the admin browser; upload signing endpoints do
not enforce the image dimensions or output format.

The CMS receives file descriptors and signs uploads. File contents go directly
to storage. Signing requires a session and a matching `Origin`. S3 signatures bind
the file size and content type and expire in five minutes.

The image field shows a preview and a progress bar for preparation, upload, and
finishing. Replacing a file keeps its image description. The field saves
`{ src, width, height, alt }` with the entry.
Removing an image clears the field. It does not delete the stored file, since
other entries may use it. Discarded entries can also leave unused files in storage.
There is no shared media library yet.
