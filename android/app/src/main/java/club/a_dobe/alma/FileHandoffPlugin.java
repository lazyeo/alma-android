package club.a_dobe.alma;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@CapacitorPlugin(name = "FileHandoff")
public class FileHandoffPlugin extends Plugin {
    private static final long MAX_BYTES = 50L * 1024L * 1024L;
    private final Map<String, PendingFile> pending = new HashMap<>();

    private static final class PendingFile {
        final File file;
        final String mimeType;
        final long expectedSize;
        long written;

        PendingFile(File file, String mimeType, long expectedSize) {
            this.file = file;
            this.mimeType = mimeType;
            this.expectedSize = expectedSize;
        }
    }

    @PluginMethod
    public void begin(PluginCall call) {
        String name = safeName(call.getString("name", "file"));
        String mimeType = call.getString("mimeType", "application/octet-stream");
        // PluginCall.getLong only accepts boxed Long; JSON numbers below 2^31 arrive as Integer.
        long size = call.getData().optLong("size", -1);
        if (size < 0 || size > MAX_BYTES) {
            call.reject("File is too large", "FILE_TOO_LARGE");
            return;
        }
        try {
            File directory = new File(getContext().getCacheDir(), "file-handoff");
            if (!directory.exists() && !directory.mkdirs()) throw new Exception("Cannot create cache directory");
            String token = UUID.randomUUID().toString();
            // One folder per transfer keeps the original file name visible to Open with / Share.
            File folder = new File(directory, token);
            if (!folder.mkdirs()) throw new Exception("Cannot create cache directory");
            File file = new File(folder, name);
            if (!file.createNewFile()) throw new Exception("Cannot create cache file");
            pending.put(token, new PendingFile(file, mimeType, size));
            JSObject result = new JSObject();
            result.put("token", token);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not prepare file", error);
        }
    }

    @PluginMethod
    public void append(PluginCall call) {
        PendingFile entry = require(call);
        if (entry == null) return;
        String encoded = call.getString("base64");
        if (encoded == null) {
            call.reject("Missing file chunk");
            return;
        }
        try {
            byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
            if (entry.written + bytes.length > MAX_BYTES || entry.written + bytes.length > entry.expectedSize) {
                call.reject("File is too large", "FILE_TOO_LARGE");
                return;
            }
            try (FileOutputStream output = new FileOutputStream(entry.file, true)) {
                output.write(bytes);
            }
            entry.written += bytes.length;
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not write file", error);
        }
    }

    @PluginMethod
    public void finish(PluginCall call) {
        PendingFile entry = require(call);
        if (entry == null) return;
        if (entry.written != entry.expectedSize) {
            call.reject("File transfer is incomplete");
            return;
        }
        if (call.getBoolean("open", false)) open(entry);
        call.resolve();
    }

    @PluginMethod
    public void share(PluginCall call) {
        PendingFile entry = require(call);
        if (entry == null) return;
        Intent intent = new Intent(Intent.ACTION_SEND);
        intent.setType(entry.mimeType);
        intent.putExtra(Intent.EXTRA_STREAM, uri(entry));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getActivity().startActivity(Intent.createChooser(intent, getContext().getString(R.string.file_chooser_share)));
        call.resolve();
    }

    @PluginMethod
    public void save(PluginCall call) {
        PendingFile entry = require(call);
        if (entry == null) return;
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                call.reject("Save to Downloads requires Android 10 or newer", "UNAVAILABLE");
                return;
            }
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, entry.file.getName());
            values.put(MediaStore.Downloads.MIME_TYPE, entry.mimeType);
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            ContentResolver resolver = getContext().getContentResolver();
            Uri target = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (target == null) throw new Exception("Downloads destination unavailable");
            try (OutputStream output = resolver.openOutputStream(target); java.io.FileInputStream input = new java.io.FileInputStream(entry.file)) {
                if (output == null) throw new Exception("Downloads stream unavailable");
                byte[] buffer = new byte[64 * 1024];
                int count;
                while ((count = input.read(buffer)) >= 0) output.write(buffer, 0, count);
            }
            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(target, values, null, null);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not save to Downloads", error);
        }
    }

    @PluginMethod
    public void openExternal(PluginCall call) {
        String value = call.getString("url");
        if (value == null) {
            call.reject("Missing URL");
            return;
        }
        try {
            Uri uri = Uri.parse(value);
            String scheme = uri.getScheme();
            if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) {
                call.reject("Unsupported URL");
                return;
            }
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri));
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not open URL", error);
        }
    }

    private void open(PendingFile entry) {
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri(entry), entry.mimeType);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getActivity().startActivity(Intent.createChooser(intent, getContext().getString(R.string.file_chooser_open)));
    }

    private Uri uri(PendingFile entry) {
        return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", entry.file);
    }

    private PendingFile require(PluginCall call) {
        String token = call.getString("token");
        PendingFile entry = token == null ? null : pending.get(token);
        if (entry == null) call.reject("File transfer expired", "NOT_FOUND");
        return entry;
    }

    private static String safeName(String name) {
        String value = name.replace('\\', '_').replace('/', '_').replaceAll("[\\r\\n]", "").trim();
        return value.isEmpty() ? "file" : value;
    }

}
