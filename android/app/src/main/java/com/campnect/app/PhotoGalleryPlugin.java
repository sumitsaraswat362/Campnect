package com.campnect.app;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.annotation.ActivityCallback;

import androidx.activity.result.ActivityResult;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

@CapacitorPlugin(
    name = "PhotoGallery",
    permissions = {
        @Permission(alias = "mediaModern", strings = {
            Manifest.permission.READ_MEDIA_VIDEO,
             Manifest.permission.READ_MEDIA_IMAGES
        }),
        @Permission(alias = "photosModern", strings = {
            Manifest.permission.READ_MEDIA_IMAGES
        }),
        @Permission(alias = "mediaLegacy", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class PhotoGalleryPlugin extends Plugin {
    @PluginMethod
    public void getRecentMedia(PluginCall call) {
        String alias = mediaPermissionAlias();
        if (getPermissionState(alias) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias, call, "mediaPermissionCallback");
            return;
        }
        loadRecentMedia(call);
    }

    @PermissionCallback
    private void mediaPermissionCallback(PluginCall call) {
        if (getPermissionState(mediaPermissionAlias()) != PermissionState.GRANTED) {
            call.reject("Photo and video access was not granted.");
            return;
        }
        loadRecentMedia(call);
    }

    @PluginMethod
    public void getRecentPhotos(PluginCall call) {
        String alias = photosPermissionAlias();
        if (getPermissionState(alias) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias, call, "photosPermissionCallback");
            return;
        }
        loadRecentPhotos(call);
    }

    @PermissionCallback
    private void photosPermissionCallback(PluginCall call) {
        if (getPermissionState(photosPermissionAlias()) != PermissionState.GRANTED) {
            call.reject("Photo access was not granted.");
            return;
        }
        loadRecentPhotos(call);
    }

    @PluginMethod
    public void readMedia(PluginCall call) {
        String rawId = call.getString("id");
        if (rawId == null) {
            call.reject("A media id is required.");
            return;
        }
        try {
            long id = Long.parseLong(rawId);
            Uri uri = ContentUris.withAppendedId(MediaStore.Files.getContentUri("external"), id);
            ContentResolver resolver = getContext().getContentResolver();
            String mimeType = resolver.getType(uri);
            String name = "campnect-media-" + id + extensionFor(mimeType);
            try (InputStream input = resolver.openInputStream(uri); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                if (input == null) throw new IllegalStateException("Media could not be opened.");
                byte[] buffer = new byte[16 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                JSObject result = new JSObject();
                result.put("data", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
                result.put("mimeType", mimeType == null ? "application/octet-stream" : mimeType);
                result.put("name", name);
                call.resolve(result);
            }
        } catch (Exception error) {
            call.reject("Media could not be read.", error);
        }
    }

    @PluginMethod
    public void readPhoto(PluginCall call) {
        String rawId = call.getString("id");
        if (rawId == null) {
            call.reject("A photo id is required.");
            return;
        }
        try {
            long id = Long.parseLong(rawId);
            Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
            resolvePhoto(call, uri, "campnect-photo-" + id);
        } catch (Exception error) {
            call.reject("Photo could not be read.", error);
        }
    }

    @PluginMethod
    public void pickPhoto(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivityForResult(call, intent, "pickPhotoResult");
        } catch (ActivityNotFoundException error) {
            call.reject("Android could not open the photo picker.", error);
        } catch (SecurityException error) {
            call.reject("Android blocked access to the selected photo.", error);
        }
    }

    @ActivityCallback
    private void pickPhotoResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("Photo selection cancelled.");
            return;
        }
        resolvePhoto(call, result.getData().getData(), "campnect-photo-" + System.currentTimeMillis());
    }

    private void resolvePhoto(PluginCall call, Uri uri, String namePrefix) {
        try {
            ContentResolver resolver = getContext().getContentResolver();
            String sourceMimeType = resolver.getType(uri);
            try (InputStream input = resolver.openInputStream(uri); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                if (input == null) throw new IllegalStateException("Photo could not be opened.");
                byte[] buffer = new byte[16 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                byte[] bytes = output.toByteArray();
                String mimeType = sourceMimeType == null ? "image/jpeg" : sourceMimeType;

                // Android camera apps can save HEIC/HEIF photos. Campnect stores
                // a deliberately small, safe set of image formats, so turn any
                // other raster camera format into a regular JPEG before it
                // crosses the WebView boundary. The web client and API can then
                // preview and validate the exact bytes they upload.
                if (!isDirectlySupportedImageMime(mimeType)) {
                    Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                    if (bitmap == null) throw new IllegalStateException("Photo format is not supported.");
                    try (ByteArrayOutputStream jpeg = new ByteArrayOutputStream()) {
                        if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 94, jpeg)) {
                            throw new IllegalStateException("Photo could not be converted.");
                        }
                        bytes = jpeg.toByteArray();
                        mimeType = "image/jpeg";
                    } finally {
                        bitmap.recycle();
                    }
                }
                JSObject result = new JSObject();
                result.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
                result.put("mimeType", mimeType);
                result.put("name", namePrefix + extensionFor(mimeType));
                call.resolve(result);
            }
        } catch (Exception error) {
            call.reject("Photo could not be read.", error);
        }
    }

    private void loadRecentMedia(PluginCall call) {
        int limit = Math.max(1, Math.min(call.getInt("limit", 60), 100));
        String[] projection = {
            MediaStore.Files.FileColumns._ID,
            MediaStore.Files.FileColumns.DISPLAY_NAME,
            MediaStore.Files.FileColumns.MIME_TYPE,
            MediaStore.Files.FileColumns.MEDIA_TYPE,
            MediaStore.Files.FileColumns.WIDTH,
            MediaStore.Files.FileColumns.HEIGHT
        };
        JSArray media = new JSArray();
        ContentResolver resolver = getContext().getContentResolver();
        try (Cursor cursor = resolver.query(
            MediaStore.Files.getContentUri("external"),
            projection,
            MediaStore.Files.FileColumns.MEDIA_TYPE + " IN (?, ?)",
            new String[] {
                String.valueOf(MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO),
                String.valueOf(MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE)
            },
            MediaStore.Files.FileColumns.DATE_ADDED + " DESC"
        )) {
            if (cursor != null) {
                int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID);
                int nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME);
                int mimeColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MIME_TYPE);
                int typeColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MEDIA_TYPE);
                int widthColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.WIDTH);
                int heightColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.HEIGHT);
                while (cursor.moveToNext() && media.length() < limit) {
                    long id = cursor.getLong(idColumn);
                    int nativeMediaType = cursor.getInt(typeColumn);
                    String mediaType = nativeMediaType == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO ? "video" : "image";
                    Uri uri = ContentUris.withAppendedId(MediaStore.Files.getContentUri("external"), id);
                    String thumbnail = "";
                    if ("video".equals(mediaType)) {
                        try {
                            // loadThumbnail() is unreliable against the generic Files
                            // collection URI on many OEM builds; the type-specific
                            // Video collection URI is the documented-compatible one.
                            Uri videoUri = ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id);
                            Bitmap bitmap = loadThumbnail(resolver, videoUri, id);
                            ByteArrayOutputStream output = new ByteArrayOutputStream();
                            bitmap.compress(Bitmap.CompressFormat.JPEG, 72, output);
                            bitmap.recycle();
                            thumbnail = "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
                        } catch (Exception ignored) {
                            // Keep videos selectable even when Android cannot generate a thumbnail.
                        }
                    } else {
                        try {
                            Uri imageUri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
                            Bitmap bitmap = loadThumbnail(resolver, imageUri, id);
                            ByteArrayOutputStream output = new ByteArrayOutputStream();
                            bitmap.compress(Bitmap.CompressFormat.JPEG, 78, output);
                            bitmap.recycle();
                            thumbnail = "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
                        } catch (Exception ignored) {
                            // Keep photos selectable even when Android cannot generate a thumbnail.
                        }
                    }
                    try {
                        JSObject item = new JSObject();
                        item.put("id", String.valueOf(id));
                        item.put("name", cursor.getString(nameColumn));
                        item.put("mimeType", cursor.getString(mimeColumn));
                        item.put("mediaType", mediaType);
                        item.put("width", cursor.getInt(widthColumn));
                        item.put("height", cursor.getInt(heightColumn));
                        item.put("thumbnail", thumbnail);
                        media.put(item);
                    } catch (Exception ignored) {
                        // A deleted or cloud-only item should not block the rest of Recents.
                    }
                }
            }
            JSObject result = new JSObject();
            result.put("media", media);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Recent media could not be loaded.", error);
        }
    }

    private void loadRecentPhotos(PluginCall call) {
        int limit = Math.max(1, Math.min(call.getInt("limit", 60), 100));
        String[] projection = {
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.MIME_TYPE,
            MediaStore.Images.Media.WIDTH,
            MediaStore.Images.Media.HEIGHT
        };
        JSArray photos = new JSArray();
        ContentResolver resolver = getContext().getContentResolver();
        try (Cursor cursor = resolver.query(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            projection,
            MediaStore.Images.Media.MIME_TYPE + " LIKE ?",
            new String[] { "image/%" },
            MediaStore.Images.Media.DATE_ADDED + " DESC"
        )) {
            if (cursor != null) {
                int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
                int nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME);
                int mimeColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE);
                int widthColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.WIDTH);
                int heightColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.HEIGHT);
                while (cursor.moveToNext() && photos.length() < limit) {
                    long id = cursor.getLong(idColumn);
                    Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
                    String thumbnail = "";
                    try {
                        Bitmap bitmap = loadThumbnail(resolver, uri, id);
                        ByteArrayOutputStream output = new ByteArrayOutputStream();
                        bitmap.compress(Bitmap.CompressFormat.JPEG, 78, output);
                        bitmap.recycle();
                        thumbnail = "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
                    } catch (Exception ignored) {
                        // Keep the photo selectable even when Android cannot generate a thumbnail.
                    }
                    try {
                        JSObject item = new JSObject();
                        item.put("id", String.valueOf(id));
                        item.put("name", cursor.getString(nameColumn));
                        item.put("mimeType", cursor.getString(mimeColumn));
                        item.put("mediaType", "image");
                        item.put("width", cursor.getInt(widthColumn));
                        item.put("height", cursor.getInt(heightColumn));
                        item.put("thumbnail", thumbnail);
                        photos.put(item);
                    } catch (Exception ignored) {
                        // A deleted or cloud-only item should not block the rest of Recents.
                    }
                }
            }
            JSObject result = new JSObject();
            result.put("photos", photos);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Recent photos could not be loaded.", error);
        }
    }

    @SuppressWarnings("deprecation")
    private Bitmap loadThumbnail(ContentResolver resolver, Uri uri, long id) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return resolver.loadThumbnail(uri, new Size(360, 360), null);
        }
        Bitmap thumbnail = MediaStore.Images.Thumbnails.getThumbnail(
            resolver,
            id,
            MediaStore.Images.Thumbnails.MINI_KIND,
            null
        );
        if (thumbnail == null) throw new IllegalStateException("Thumbnail unavailable.");
        return thumbnail;
    }

    private String mediaPermissionAlias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "mediaModern" : "mediaLegacy";
    }

    private String photosPermissionAlias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "photosModern" : "mediaLegacy";
    }

    private String extensionFor(String mimeType) {
        if ("image/jpeg".equals(mimeType)) return ".jpg";
        if ("image/png".equals(mimeType)) return ".png";
        if ("image/webp".equals(mimeType)) return ".webp";
        if ("image/gif".equals(mimeType)) return ".gif";
        if ("video/quicktime".equals(mimeType)) return ".mov";
        if ("video/webm".equals(mimeType)) return ".webm";
        if (mimeType != null && mimeType.startsWith("video/")) return ".mp4";
        return "";
    }

    private boolean isDirectlySupportedImageMime(String mimeType) {
        return "image/jpeg".equals(mimeType)
            || "image/png".equals(mimeType)
            || "image/webp".equals(mimeType)
            || "image/gif".equals(mimeType);
    }
}