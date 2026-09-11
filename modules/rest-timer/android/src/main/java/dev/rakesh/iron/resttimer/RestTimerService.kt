package dev.rakesh.iron.resttimer

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Foreground service that keeps the rest countdown visible and the process alive
 * while the screen is off. It does not tick: Android's chronometer renders the
 * countdown, and RestTimerAlarmReceiver ends it.
 */
class RestTimerService : Service() {
  companion object {
    const val ACTION_START = "dev.rakesh.iron.resttimer.START"
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val endsAt = RestTimerController.getEndsAt(this)
    if (endsAt == null || endsAt <= System.currentTimeMillis()) {
      stopSelf()
      return START_NOT_STICKY
    }
    RestTimerController.ensureChannels(this)
    val notification = RestTimerController.buildOngoing(this, endsAt, RestTimerController.getLabel(this))
    try {
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(RestTimerController.ONGOING_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE)
      } else {
        startForeground(RestTimerController.ONGOING_ID, notification)
      }
    } catch (e: Exception) {
      stopSelf()
    }
    return START_NOT_STICKY
  }

  /** shortService hit its ~3 minute ceiling. The exact alarm still fires at endsAt. */
  override fun onTimeout(startId: Int) {
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }
}
