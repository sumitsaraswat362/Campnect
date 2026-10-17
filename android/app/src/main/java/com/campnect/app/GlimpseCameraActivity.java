package com.campnect.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.core.ZoomState;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.video.FileOutputOptions;
import androidx.camera.video.FallbackStrategy;
import androidx.camera.video.PendingRecording;
import androidx.camera.video.Quality;
import androidx.camera.video.QualitySelector;
import androidx.camera.video.Recorder;
import androidx.camera.video.Recording;
import androidx.camera.video.VideoCapture;
import androidx.camera.video.VideoRecordEvent;
import androidx.camera.view.PreviewView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.google.common.util.concurrent.ListenableFuture;

import java.io.File;
import java.util.Arrays;
import java.util.concurrent.ExecutionException;

/**
 * Full-screen native CameraX capture for Glimpses. CameraX controls the actual
 * logical-camera zoom ratio; React receives only the original temp file URI.
 */
public class GlimpseCameraActivity extends AppCompatActivity {
    private static final int CAMERA_PERMISSION_REQUEST = 918;
    private static final int MAX_VIDEO_SECONDS = 60;
    private PreviewView previewView;
    private Preview preview;
    private ProcessCameraProvider cameraProvider;
    private Camera camera;
    private ImageCapture imageCapture;
    private VideoCapture<Recorder> videoCapture;
    private Recording recording;
    private int lensFacing = CameraSelector.LENS_FACING_BACK;
    private int maxVideoSeconds = MAX_VIDEO_SECONDS;
    private TextView zoomLabel;
    private TextView captureHint;
    private ImageButton shutter;
    private long recordingStartedAt;
    private Runnable holdStartRunnable;
    private boolean shutterPressed;
    private boolean holdStarted;
    private boolean stopRecordingWhenStarted;
    private Insets cameraInsets = Insets.NONE;

    private static final long VIDEO_HOLD_DELAY_MS = 300L;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        maxVideoSeconds = Math.max(1, Math.min(getIntent().getIntExtra("maxVideoSeconds", MAX_VIDEO_SECONDS), MAX_VIDEO_SECONDS));
        buildUi();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                cancelCapture();
            }
        });
        if (hasCameraPermission()) startCamera();
        else ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO}, CAMERA_PERMISSION_REQUEST);
    }

    private void buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        previewView = new PreviewView(this);
        previewView.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        root.addView(previewView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        FrameLayout controls = new FrameLayout(this);
        root.addView(controls, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        ImageButton close = iconButton(R.drawable.ic_close, 48, Color.BLACK);
        close.setContentDescription("Close camera");
        FrameLayout.LayoutParams closeParams = params(48, 48, Gravity.TOP | Gravity.START, 18, 42, 0, 0);
        controls.addView(close, closeParams);
        close.setOnClickListener(v -> cancelCapture());

        zoomLabel = new TextView(this);
        zoomLabel.setText("1.0×");
        zoomLabel.setTextColor(Color.WHITE);
        zoomLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        zoomLabel.setGravity(Gravity.CENTER);
        zoomLabel.setBackgroundColor(0x66000000);
        controls.addView(zoomLabel, params(76, 38, Gravity.TOP | Gravity.CENTER_HORIZONTAL, 0, 48, 0, 0));

        ImageButton switchCamera = iconButton(R.drawable.ic_camera_flip, 52, Color.WHITE);
        switchCamera.setContentDescription("Switch between front and back camera");
        controls.addView(switchCamera, params(52, 52, Gravity.TOP | Gravity.END, 0, 40, 18, 0));
        switchCamera.setOnClickListener(v -> {
            lensFacing = lensFacing == CameraSelector.LENS_FACING_BACK ? CameraSelector.LENS_FACING_FRONT : CameraSelector.LENS_FACING_BACK;
            bindCamera();
        });

        captureHint = new TextView(this);
        captureHint.setText("Tap for photo  •  Hold for video");
        captureHint.setTextColor(Color.WHITE);
        captureHint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        captureHint.setGravity(Gravity.CENTER);
        controls.addView(captureHint, params(260, 36, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL, 0, 0, 0, 122));

        shutter = iconButton(R.drawable.ic_shutter, 88, Color.WHITE);
        shutter.setContentDescription("Tap for photo, hold for video");
        controls.addView(shutter, params(88, 88, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL, 0, 0, 0, 24));
        shutter.setOnTouchListener((view, event) -> {
            switch (event.getActionMasked()) {
                case android.view.MotionEvent.ACTION_DOWN:
                    if (recording != null || shutterPressed) return true;
                    shutterPressed = true;
                    holdStarted = false;
                    stopRecordingWhenStarted = false;
                    holdStartRunnable = () -> {
                        if (!shutterPressed || recording != null) return;
                        holdStarted = true;
                        startRecording();
                    };
                    shutter.postDelayed(holdStartRunnable, VIDEO_HOLD_DELAY_MS);
                    return true;
                case android.view.MotionEvent.ACTION_UP:
                    releaseShutter(true);
                    return true;
                case android.view.MotionEvent.ACTION_CANCEL:
                    releaseShutter(false);
                    return true;
                default:
                    return true;
            }
        });
        setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            cameraInsets = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            updateControlsLayout(root, close, switchCamera);
            return insets;
        });
        root.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            if (right - left != oldRight - oldLeft || bottom - top != oldBottom - oldTop) {
                updateControlsLayout(root, close, switchCamera);
            }
        });
        ViewCompat.requestApplyInsets(root);

        ScaleGestureDetector pinch = new ScaleGestureDetector(this, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(ScaleGestureDetector detector) {
                if (camera == null || camera.getCameraInfo().getZoomState().getValue() == null) return false;
                ZoomState state = camera.getCameraInfo().getZoomState().getValue();
                float next = Math.max(state.getMinZoomRatio(), Math.min(state.getMaxZoomRatio(), state.getZoomRatio() * detector.getScaleFactor()));
                camera.getCameraControl().setZoomRatio(next);
                zoomLabel.setText(String.format(java.util.Locale.US, "%.1f×", next));
                return true;
            }
        });
        previewView.setOnTouchListener((view, event) -> pinch.onTouchEvent(event));
    }

    private void updateControlsLayout(FrameLayout root, ImageButton close, ImageButton switchCamera) {
        int availableHeight = root.getHeight() - cameraInsets.top - cameraInsets.bottom;
        int availableWidth = root.getWidth() - cameraInsets.left - cameraInsets.right;
        boolean compact = availableHeight > 0 && availableHeight < dp(330);
        previewView.setScaleType(availableWidth >= dp(600)
            ? PreviewView.ScaleType.FIT_CENTER : PreviewView.ScaleType.FILL_CENTER);
        setControlMargins(close, cameraInsets.left + dp(18), cameraInsets.top + dp(18), 0, 0);
        setControlMargins(switchCamera, 0, cameraInsets.top + dp(16), cameraInsets.right + dp(18), 0);
        setControlMargins(zoomLabel, 0, cameraInsets.top + dp(24), 0, 0);
        setControlMargins(shutter, 0, 0, 0, cameraInsets.bottom + dp(compact ? 12 : 24));
        setControlMargins(captureHint, 0, 0, 0, cameraInsets.bottom + dp(122));
        captureHint.setVisibility(compact ? View.GONE : View.VISIBLE);
    }

    @Override
    public void onConfigurationChanged(@NonNull Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // The activity handles configuration changes without recreation. Update
        // CameraX output rotation when a foldable or tablet rotates in place.
        previewView.post(this::updateCaptureRotation);
    }

    private int displayRotation() {
        return previewView.getDisplay() != null
            ? previewView.getDisplay().getRotation()
            : getWindowManager().getDefaultDisplay().getRotation();
    }

    private void updateCaptureRotation() {
        int rotation = displayRotation();
        if (preview != null) preview.setTargetRotation(rotation);
        if (imageCapture != null) imageCapture.setTargetRotation(rotation);
        // Keep a recording's output orientation fixed until that clip finishes.
        if (videoCapture != null && recording == null) videoCapture.setTargetRotation(rotation);
    }

    private boolean hasCameraPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_PERMISSION_REQUEST && hasCameraPermission()) startCamera();
        else if (requestCode == CAMERA_PERMISSION_REQUEST) finish();
    }

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            try {
                cameraProvider = future.get();
                bindCamera();
            } catch (ExecutionException | InterruptedException error) {
                finish();
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void bindCamera() {
        if (cameraProvider == null || recording != null) return;
        preview = new Preview.Builder().setTargetRotation(displayRotation()).build();
        preview.setSurfaceProvider(previewView.getSurfaceProvider());
        imageCapture = new ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
            .setTargetRotation(displayRotation())
            .build();
        Recorder recorder = new Recorder.Builder()
            .setQualitySelector(QualitySelector.fromOrderedList(Arrays.asList(Quality.UHD, Quality.FHD, Quality.HD), FallbackStrategy.lowerQualityOrHigherThan(Quality.HD)))
            .build();
        videoCapture = VideoCapture.withOutput(recorder);
        videoCapture.setTargetRotation(displayRotation());
        try {
            cameraProvider.unbindAll();
            camera = cameraProvider.bindToLifecycle(this, new CameraSelector.Builder().requireLensFacing(lensFacing).build(), preview, imageCapture, videoCapture);
            ZoomState state = camera.getCameraInfo().getZoomState().getValue();
            if (state != null) zoomLabel.setText(String.format(java.util.Locale.US, "%.1f×", state.getZoomRatio()));
        } catch (Exception error) {
            finish();
        }
    }

    private void capturePhoto() {
        if (imageCapture == null) return;
        File file = new File(getCacheDir(), "glimpse-" + System.currentTimeMillis() + ".jpg");
        imageCapture.takePicture(new ImageCapture.OutputFileOptions.Builder(file).build(), ContextCompat.getMainExecutor(this),
            new ImageCapture.OnImageSavedCallback() {
                @Override public void onImageSaved(@NonNull ImageCapture.OutputFileResults result) { returnFile(file, "image/jpeg"); }
                @Override public void onError(@NonNull ImageCaptureException error) { }
            });
    }

    private void startRecording() {
        if (videoCapture == null) return;
        File file = new File(getCacheDir(), "glimpse-" + System.currentTimeMillis() + ".mp4");
        PendingRecording pending = videoCapture.getOutput().prepareRecording(this, new FileOutputOptions.Builder(file).build());
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) pending = pending.withAudioEnabled();
        recordingStartedAt = SystemClock.elapsedRealtime();
        recording = pending.start(ContextCompat.getMainExecutor(this), event -> {
            if (event instanceof VideoRecordEvent.Start) {
                setShutterRecording(true);
                if (stopRecordingWhenStarted && recording != null) recording.stop();
                shutter.postDelayed(() -> { if (recording != null) recording.stop(); }, maxVideoSeconds * 1000L);
            } else if (event instanceof VideoRecordEvent.Finalize) {
                recording = null;
                updateCaptureRotation();
                stopRecordingWhenStarted = false;
                setShutterRecording(false);
                VideoRecordEvent.Finalize done = (VideoRecordEvent.Finalize) event;
                if (!done.hasError() && SystemClock.elapsedRealtime() - recordingStartedAt >= 250) returnFile(file, "video/mp4");
            }
        });
    }

    private void releaseShutter(boolean capturePhotoOnTap) {
        shutterPressed = false;
        if (holdStartRunnable != null) {
            shutter.removeCallbacks(holdStartRunnable);
            holdStartRunnable = null;
        }
        if (holdStarted) {
            stopRecordingWhenStarted = true;
            if (recording != null) recording.stop();
        } else if (capturePhotoOnTap) {
            capturePhoto();
        }
    }

    private void returnFile(File file, String mimeType) {
        Intent output = new Intent();
        output.putExtra("uri", android.net.Uri.fromFile(file).toString());
        output.putExtra("mimeType", mimeType);
        output.putExtra("name", file.getName());
        output.putExtra("size", file.length());
        setResult(RESULT_OK, output);
        finish();
    }

    private void cancelCapture() {
        setResult(RESULT_CANCELED);
        finish();
    }

    @Override
    protected void onDestroy() {
        if (holdStartRunnable != null) shutter.removeCallbacks(holdStartRunnable);
        if (recording != null) recording.stop();
        if (cameraProvider != null) cameraProvider.unbindAll();
        super.onDestroy();
    }

    private ImageButton iconButton(int drawableId, int size, int backgroundColor) {
        ImageButton button = new ImageButton(this);
        button.setImageResource(drawableId);
        button.setScaleType(ImageView.ScaleType.CENTER);
        button.setPadding(dp(11), dp(11), dp(11), dp(11));
        GradientDrawable background = new GradientDrawable();
        background.setColor(backgroundColor);
        background.setShape(GradientDrawable.OVAL);
        button.setBackground(background);
        return button;
    }

    private void setShutterRecording(boolean isRecording) {
        if (isRecording) {
            shutter.setImageResource(R.drawable.ic_stop);
            setCircleBackground(shutter, Color.rgb(220, 38, 38));
        } else {
            shutter.setImageResource(R.drawable.ic_shutter);
            setCircleBackground(shutter, Color.WHITE);
        }
    }

    private void setCircleBackground(ImageButton button, int color) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(color);
        background.setShape(GradientDrawable.OVAL);
        button.setBackground(background);
    }

    private void setControlMargins(View view, int left, int top, int right, int bottom) {
        FrameLayout.LayoutParams layoutParams = (FrameLayout.LayoutParams) view.getLayoutParams();
        if (layoutParams.leftMargin != left || layoutParams.topMargin != top
            || layoutParams.rightMargin != right || layoutParams.bottomMargin != bottom) {
            layoutParams.setMargins(left, top, right, bottom);
            view.setLayoutParams(layoutParams);
        }
    }

    private FrameLayout.LayoutParams params(int width, int height, int gravity, int left, int top, int right, int bottom) {
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(dp(width), dp(height), gravity);
        params.setMargins(dp(left), dp(top), dp(right), dp(bottom));
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}