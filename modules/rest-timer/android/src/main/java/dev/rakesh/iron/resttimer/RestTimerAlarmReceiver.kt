package dev.rakesh.iron.resttimer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Fired by the exact alarm at endsAt. Doze cannot defer an exact allow-while-idle alarm. */
class RestTimerAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    RestTimerController.onFinished(context)
  }
}
