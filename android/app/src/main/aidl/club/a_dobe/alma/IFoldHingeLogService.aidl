package club.a_dobe.alma;

import android.os.ParcelFileDescriptor;

interface IFoldHingeLogService {
    ParcelFileDescriptor openHingeLog() = 1;
    // Shizuku's reserved destroy code: the server sends it on unbind and when
    // the app dies, and the service process must exit in response.
    void destroy() = 16777114;
}
