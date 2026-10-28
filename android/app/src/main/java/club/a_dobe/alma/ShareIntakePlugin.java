package club.a_dobe.alma;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.text.TextUtils;
import androidx.core.app.Person;
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "ShareIntake")
public class ShareIntakePlugin extends Plugin {
    private static final long MAX_FILE_BYTES = 20L * 1024L * 1024L;
    private static final String SHARE_CATEGORY = BuildConfig.APPLICATION_ID + ".SHARE_TARGET";
    private static final String EXTRA_SHORTCUT_ID = "android.intent.extra.shortcut.ID";
    private JSObject pending;

    @Override
    public void load() {
        super.load();
        pending = readShareIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        JSObject payload = readShareIntent(intent);
        if (payload == null) return;
        pending = payload;
        notifyListeners("shareReceived", payload, true);
    }

    @PluginMethod
    public void getPendingShare(PluginCall call) {
        call.resolve(pending == null ? new JSObject() : pending);
    }

    @PluginMethod
    public void consumePendingShare(PluginCall call) {
        pending = null;
        Intent intent = getActivity().getIntent();
        if (intent != null && isShareIntent(intent)) {
            intent.setAction(Intent.ACTION_MAIN);
            intent.removeExtra(Intent.EXTRA_TEXT);
            intent.removeExtra(Intent.EXTRA_SUBJECT);
            intent.removeExtra(Intent.EXTRA_STREAM);
            intent.removeExtra(EXTRA_SHORTCUT_ID);
            intent.setClipData(null);
        }
        call.resolve();
    }

    @PluginMethod
    public void updateShortcuts(PluginCall call) {
        JSArray rows = call.getArray("shortcuts", new JSArray());
        Set<String> activeDesktopIds = stringSet(call.getArray("activeDesktopIds", new JSArray()));
        List<ShortcutInfoCompat> shortcuts = new ArrayList<>();
        try {
            for (int index = 0; index < rows.length(); index++) {
                JSONObject row = rows.getJSONObject(index);
                String id = row.optString("id");
                String label = row.optString("label");
                String desktopName = row.optString("desktopName");
                if (TextUtils.isEmpty(id) || TextUtils.isEmpty(label)) continue;
                Set<String> categories = new HashSet<>();
                categories.add(SHARE_CATEGORY);
                Person person = new Person.Builder()
                    .setName(label)
                    .setIcon(avatarIcon(label, desktopName))
                    .build();
                Intent launch = new Intent(getContext(), MainActivity.class)
                    .setAction(Intent.ACTION_SEND)
                    .setType("text/plain")
                    .putExtra(EXTRA_SHORTCUT_ID, id);
                ShortcutInfoCompat shortcut = new ShortcutInfoCompat.Builder(getContext(), id)
                    .setShortLabel(label)
                    .setLongLabel(TextUtils.isEmpty(desktopName) ? label : getContext().getString(R.string.share_shortcut_long_label, label, desktopName))
                    .setIcon(avatarIcon(label, desktopName))
                    .setIntent(launch)
                    .setCategories(categories)
                    .setPerson(person)
                    .setLongLived(true)
                    .build();
                ShortcutManagerCompat.pushDynamicShortcut(getContext(), shortcut);
                shortcuts.add(shortcut);
            }
            removeUnpairedShortcuts(activeDesktopIds);
            call.resolve();
        } catch (JSONException error) {
            call.reject("Could not publish share shortcuts", error);
        }
    }

    @PluginMethod
    public void reportShortcutUsed(PluginCall call) {
        String id = call.getString("id");
        if (!TextUtils.isEmpty(id)) ShortcutManagerCompat.reportShortcutUsed(getContext(), id);
        call.resolve();
    }

    private void removeUnpairedShortcuts(Set<String> activeDesktopIds) {
        List<String> remove = new ArrayList<>();
        for (ShortcutInfoCompat shortcut : ShortcutManagerCompat.getDynamicShortcuts(getContext())) {
            String desktopId = desktopIdFromShortcut(shortcut.getId());
            if (desktopId != null && !activeDesktopIds.contains(desktopId)) remove.add(shortcut.getId());
        }
        if (!remove.isEmpty()) ShortcutManagerCompat.removeDynamicShortcuts(getContext(), remove);
    }

    private String desktopIdFromShortcut(String id) {
        String[] parts = id.split(":", -1);
        if (parts.length < 2 || !("thread".equals(parts[0]) || "new".equals(parts[0]))) return null;
        try {
            return Uri.decode(parts[1]);
        } catch (Exception ignored) {
            return null;
        }
    }

    private Set<String> stringSet(JSArray values) {
        Set<String> result = new HashSet<>();
        for (int index = 0; index < values.length(); index++) {
            String value = values.optString(index);
            if (!TextUtils.isEmpty(value)) result.add(value);
        }
        return result;
    }

    private IconCompat avatarIcon(String label, String desktopName) {
        int size = 192;
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.rgb(61, 78, 96));
        canvas.drawRoundRect(new RectF(0, 0, size, size), 48, 48, paint);
        paint.setColor(Color.WHITE);
        paint.setTextAlign(Paint.Align.CENTER);
        paint.setTextSize(88);
        paint.setFakeBoldText(true);
        String initial = label.trim().isEmpty() ? "A" : label.trim().substring(0, 1).toUpperCase();
        Paint.FontMetrics metrics = paint.getFontMetrics();
        canvas.drawText(initial, size / 2f, size / 2f - (metrics.ascent + metrics.descent) / 2f, paint);
        paint.setColor(Color.rgb(114, 181, 155));
        canvas.drawCircle(154, 154, 28, paint);
        paint.setColor(Color.WHITE);
        paint.setTextSize(24);
        String desktopInitial = desktopName.trim().isEmpty() ? "D" : desktopName.trim().substring(0, 1).toUpperCase();
        metrics = paint.getFontMetrics();
        canvas.drawText(desktopInitial, 154, 154 - (metrics.ascent + metrics.descent) / 2f, paint);
        return IconCompat.createWithAdaptiveBitmap(bitmap);
    }

    private JSObject readShareIntent(Intent intent) {
        if (intent == null || !isShareIntent(intent)) return null;
        JSObject payload = new JSObject();
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        String shortcutId = intent.getStringExtra(EXTRA_SHORTCUT_ID);
        if (!TextUtils.isEmpty(text)) payload.put("text", text);
        if (!TextUtils.isEmpty(subject)) payload.put("subject", subject);
        if (!TextUtils.isEmpty(shortcutId)) payload.put("shortcutId", shortcutId);
        JSArray files = new JSArray();
        List<Uri> uris = shareUris(intent);
        try {
            for (Uri uri : uris) files.put(cacheUri(uri));
        } catch (Exception error) {
            payload.put("error", error.getMessage() == null ? "Could not read the shared file." : error.getMessage());
        }
        payload.put("files", files);
        return payload;
    }

    private boolean isShareIntent(Intent intent) {
        return Intent.ACTION_SEND.equals(intent.getAction()) || Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction());
    }

    private List<Uri> shareUris(Intent intent) {
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<Uri> streams = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (streams != null) uris.addAll(streams);
        } else {
            Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (stream != null) uris.add(stream);
        }
        ClipData clip = intent.getClipData();
        if (clip != null) {
            for (int index = 0; index < clip.getItemCount(); index++) {
                Uri uri = clip.getItemAt(index).getUri();
                if (uri != null && !uris.contains(uri)) uris.add(uri);
            }
        }
        return uris;
    }

    private JSObject cacheUri(Uri uri) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        String name = displayName(resolver, uri);
        String mimeType = resolver.getType(uri);
        File directory = new File(getContext().getCacheDir(), "shared-intake");
        if (!directory.exists() && !directory.mkdirs()) throw new Exception("Could not prepare shared file storage.");
        File output = File.createTempFile("share-", safeSuffix(name), directory);
        long size = 0;
        try (InputStream input = resolver.openInputStream(uri); FileOutputStream stream = new FileOutputStream(output)) {
            if (input == null) throw new Exception("Could not open " + name + ".");
            byte[] buffer = new byte[16 * 1024];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                size += read;
                if (size > MAX_FILE_BYTES) {
                    output.delete();
                    throw new Exception(name + " is larger than the 20 MB share limit.");
                }
                stream.write(buffer, 0, read);
            }
        }
        JSObject file = new JSObject();
        file.put("name", name);
        file.put("mimeType", TextUtils.isEmpty(mimeType) ? "application/octet-stream" : mimeType);
        file.put("size", size);
        file.put("path", Uri.fromFile(output).toString());
        return file;
    }

    private String displayName(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (!TextUtils.isEmpty(name)) return name;
            }
        } catch (Exception ignored) {}
        String segment = uri.getLastPathSegment();
        return TextUtils.isEmpty(segment) ? "shared-file" : segment;
    }

    private String safeSuffix(String name) {
        int dot = name.lastIndexOf('.');
        String suffix = dot >= 0 ? name.substring(dot) : ".bin";
        return suffix.matches("\\.[A-Za-z0-9]{1,10}") ? suffix : ".bin";
    }
}
