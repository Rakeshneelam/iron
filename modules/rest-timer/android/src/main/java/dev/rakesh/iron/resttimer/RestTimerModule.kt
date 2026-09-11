package dev.rakesh.iron.resttimer

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RestTimerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context is not available")

  override fun definition() = ModuleDefinition {
    Name("RestTimer")

    Function("start") { endsAtEpochMs: Double, label: String ->
      RestTimerController.start(context, endsAtEpochMs.toLong(), label)
    }

    Function("cancel") {
      RestTimerController.cancel(context)
    }

    Function("isRunning") {
      RestTimerController.isRunning(context)
    }

    Function("getEndsAt") {
      RestTimerController.getEndsAt(context)?.toDouble()
    }
  }
}
