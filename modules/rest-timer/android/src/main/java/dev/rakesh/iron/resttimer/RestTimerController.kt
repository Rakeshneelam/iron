package dev.rakesh.iron.resttimer

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator

/**
 * Owns the rest timer's native state. `endsAt` is persisted in SharedPreferences so
 * it survives process death; the countdown on the notification is rendered by
 * Android's chronometer, and an exact alarm is the source of truth for firing.
 * Uses only platform APIs so it has no AndroidX dependency to break.
 */
object RestTimerController {
  private const val PREFS = "iron_rest_timer"
  private const val KEY_ENDS_AT = "endsAt"
  private const val KEY_LABEL = "label"

  /** Silent channel for the ongoing countdown. */
  const val LIVE_CHANNEL_ID = "rest-timer-live"
  /** Loud channel for "rest over". Same id the JS side creates; whoever runs first wins. */
  const val DONE_CHANNEL_ID = "rest-timer"

  const val ONGOING_ID = 4701
  const val DONE_ID = 4702
  private const val ALARM_REQUEST = 4703
  private const val CONTENT_REQUEST = 4704

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun start(context: Context, endsAt: Long, label: String) {
    prefs(context).edit().putLong(KEY_ENDS_AT, endsAt).putString(KEY_LABEL, label).apply()
    ensureChannels(context)
    notificationManager(context).cancel(DONE_ID)
    scheduleAlarm(context, endsAt)
    val intent = Intent(context, RestTimerService::class.java).setAction(RestTimerService.ACTION_START)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    } catch (e: Exception) {
      // Android may refuse a foreground start from the background. The exact alarm
      // still fires, so the timer is degraded (no live countdown), never lost.
    }
  }

  fun cancel(context: Context) {
    clear(context)
    alarmManager(context).cancel(alarmIntent(context))
    context.stopService(Intent(context, RestTimerService::class.java))
    notificationManager(context).cancel(ONGOING_ID)
  }

  fun isRunning(context: Context): Boolean {
    val endsAt = getEndsAt(context) ?: return false
    return endsAt > System.currentTimeMillis()
  }

  fun getEndsAt(context: Context): Long? {
    val v = prefs(context).getLong(KEY_ENDS_AT, 0L)
    return if (v > 0L) v else null
  }

  fun getLabel(context: Context): String = prefs(context).getString(KEY_LABEL, null) ?: "Rest"

  /** Called by the alarm receiver at endsAt. */
  fun onFinished(context: Context) {
    val label = getLabel(context)
    clear(context)
    context.stopService(Intent(context, RestTimerService::class.java))
    notificationManager(context).cancel(ONGOING_ID)
    ensureChannels(context)
    notificationManager(context).notify(DONE_ID, buildDone(context, label))
    vibrate(context)
  }

  private fun clear(context: Context) {
    prefs(context).edit().remove(KEY_ENDS_AT).remove(KEY_LABEL).apply()
  }

  fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = notificationManager(context)
    if (nm.getNotificationChannel(LIVE_CHANNEL_ID) == null) {
      val live = NotificationChannel(LIVE_CHANNEL_ID, "Rest timer (countdown)", NotificationManager.IMPORTANCE_LOW)
      live.setShowBadge(false)
      live.setSound(null, null)
      live.enableVibration(false)
      nm.createNotificationChannel(live)
    }
    if (nm.getNotificationChannel(DONE_CHANNEL_ID) == null) {
      val done = NotificationChannel(DONE_CHANNEL_ID, "Rest timer", NotificationManager.IMPORTANCE_HIGH)
      done.enableVibration(true)
      done.vibrationPattern = longArrayOf(0, 300, 150, 300)
      nm.createNotificationChannel(done)
    }
  }

  fun buildOngoing(context: Context, endsAt: Long, label: String): Notification {
    val builder = newBuilder(context, LIVE_CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle(label)
      .setContentText("Rest")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(true)
      .setWhen(endsAt)
      .setUsesChronometer(true)
      .setCategory(Notification.CATEGORY_STOPWATCH)
      .setContentIntent(contentIntent(context))
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) builder.setChronometerCountDown(true)
    return builder.build()
  }

  private fun buildDone(context: Context, label: String): Notification =
    newBuilder(context, DONE_CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle("Rest over")
      .setContentText("$label — next set")
      .setAutoCancel(true)
      .setCategory(Notification.CATEGORY_ALARM)
      .setContentIntent(contentIntent(context))
      .build()

  @Suppress("DEPRECATION")
  private fun newBuilder(context: Context, channel: String): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, channel)
    else Notification.Builder(context)

  private fun contentIntent(context: Context): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
    return PendingIntent.getActivity(
      context, CONTENT_REQUEST, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun alarmIntent(context: Context): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      ALARM_REQUEST,
      Intent(context, RestTimerAlarmReceiver::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  private fun scheduleAlarm(context: Context, endsAt: Long) {
    val am = alarmManager(context)
    val pi = alarmIntent(context)
    val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
    if (canExact) {
      am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, pi)
    } else {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, pi)
    }
  }

  @Suppress("DEPRECATION")
  private fun vibrate(context: Context) {
    val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
    val pattern = longArrayOf(0, 300, 150, 300)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
    } else {
      vibrator.vibrate(pattern, -1)
    }
  }

  private fun alarmManager(context: Context) = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  private fun notificationManager(context: Context) =
    context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
}
