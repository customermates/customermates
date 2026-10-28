`record-video.mp4` is a synthetic 12-second H.264 Baseline test pattern with no audio, generated with:

```sh
ffmpeg -f lavfi -i testsrc2=size=160x90:rate=5 -t 12 -an \
  -c:v libx264 -profile:v baseline -pix_fmt yuv420p -preset ultrafast \
  -crf 35 -g 5 -movflags +faststart record-video.mp4
```

The record-file browser test appends a valid MP4 `free` atom to reach 26 MB. The file remains playable while exercising an actual upload above the former limit.
