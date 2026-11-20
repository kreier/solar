#!/usr/bin/env bash
set -e

PIO="/home/mk/.pio_env/bin/pio"
ESPTOOL="/home/mk/.platformio/packages/tool-esptool/esptool"
BOOT_APP0="/home/mk/.platformio/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin"
OUT_DIR="$(pwd)/docs/firmware"
mkdir -p "$OUT_DIR"

build_target() {
    local env_name="$1"
    local chip="$2"
    local ver="$3"
    local ota_offset="$4"
    local bootloader_offset="$5"

    echo "===> Building $env_name for version $ver (Chip: $chip)..."
    cd firmware
    PLATFORMIO_BUILD_FLAGS="-D CORE_DEBUG_LEVEL=1 -D FIRMWARE_VERSION=\\\"$ver\\\"" $PIO run -e "$env_name"
    cd ..

    local build_dir="firmware/.pio/build/$env_name"
    local app_bin="$build_dir/firmware.bin"
    local bootloader_bin="$build_dir/bootloader.bin"
    local partitions_bin="$build_dir/partitions.bin"

    # Destination filenames
    local dest_app="$OUT_DIR/firmware-${chip}-v${ver}.bin"
    local dest_merged="$OUT_DIR/firmware-${chip}-merged-v${ver}.bin"

    cp "$app_bin" "$dest_app"

    local flash_size_arg="keep"
    if [ "$chip" = "esp32s3" ]; then
        flash_size_arg="16MB"
    elif [ "$chip" = "esp32" ] || [ "$chip" = "esp32c6" ]; then
        flash_size_arg="4MB"
    fi

    # Merge binary using esptool
    echo "===> Merging $chip binary for $ver (flash-size: $flash_size_arg)..."
    $ESPTOOL --chip "$chip" merge-bin \
        --flash-size "$flash_size_arg" \
        --output "$dest_merged" \
        "$bootloader_offset" "$bootloader_bin" \
        0x8000 "$partitions_bin" \
        0xe000 "$BOOT_APP0" \
        "$ota_offset" "$app_bin"

    # Create unversioned convenience links
    if [ "$ver" = "1.1.4" ]; then
        cp "$dest_app" "$OUT_DIR/firmware-${chip}.bin"
        cp "$dest_merged" "$OUT_DIR/firmware-${chip}-merged.bin"
        if [ "$chip" = "esp32" ]; then
            cp "$dest_app" "$OUT_DIR/firmware.bin"
            cp "$dest_merged" "$OUT_DIR/firmware-esp32-merged.bin"
            cp "$bootloader_bin" "$OUT_DIR/bootloader.bin"
            cp "$partitions_bin" "$OUT_DIR/partitions.bin"
            cp "$BOOT_APP0" "$OUT_DIR/boot_app0.bin"
        fi
    fi
}

echo "=========================================="
echo " BUILDING FIRMWARE v1.1.4 (STABLE)"
echo "=========================================="
build_target "esp32dev" "esp32" "1.1.4" 0x10000 0x1000
build_target "esp32s3" "esp32s3" "1.1.4" 0x10000 0x0
build_target "esp32c5" "esp32c6" "1.1.4" 0x10000 0x0

# Create C5 convenience aliases for 1.1.4
cp "$OUT_DIR/firmware-esp32c6-v1.1.4.bin" "$OUT_DIR/firmware-esp32c5-v1.1.4.bin"
cp "$OUT_DIR/firmware-esp32c6-merged-v1.1.4.bin" "$OUT_DIR/firmware-esp32c5-merged-v1.1.4.bin"
cp "$OUT_DIR/firmware-esp32c5-v1.1.4.bin" "$OUT_DIR/firmware-esp32c5.bin"
cp "$OUT_DIR/firmware-esp32c5-merged-v1.1.4.bin" "$OUT_DIR/firmware-esp32c5-merged.bin"

# Mirror to canary channel aliases
for ch in esp32 esp32s3 esp32c5 esp32c6; do
    cp "$OUT_DIR/firmware-${ch}-v1.1.4.bin" "$OUT_DIR/firmware-${ch}-v1.1.4-canary.bin"
    cp "$OUT_DIR/firmware-${ch}-merged-v1.1.4.bin" "$OUT_DIR/firmware-${ch}-merged-v1.1.4-canary.bin"
done

echo "=========================================="
echo " ALL FIRMWARES BUILT & MERGED SUCCESSFULLY"
echo "=========================================="
ls -lh "$OUT_DIR"
