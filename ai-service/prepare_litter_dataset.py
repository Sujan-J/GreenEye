from pathlib import Path
import shutil


SOURCE = Path("datasets/greeneye-litter")
TARGET = Path("datasets/greeneye-litter-oneclass")


print("Preparing GreenEye one-class dataset...")


# Create target folders
for split in ["train", "valid", "test"]:

    (TARGET / split / "images").mkdir(
        parents=True,
        exist_ok=True
    )

    (TARGET / split / "labels").mkdir(
        parents=True,
        exist_ok=True
    )


# Copy images and convert labels
for split in ["train", "valid", "test"]:

    source_images = SOURCE / split / "images"
    source_labels = SOURCE / split / "labels"

    target_images = TARGET / split / "images"
    target_labels = TARGET / split / "labels"


    print(f"\nProcessing {split}...")


    image_files = []

    for extension in ["*.jpg", "*.jpeg", "*.png"]:

        image_files.extend(
            source_images.glob(extension)
        )


    print(f"Images found: {len(image_files)}")


    # Copy images
    for image in image_files:

        shutil.copy2(
            image,
            target_images / image.name
        )


    # Convert every object to class 0 = litter
    label_files = list(
        source_labels.glob("*.txt")
    )


    print(f"Labels found: {len(label_files)}")


    for label_file in label_files:

        output_file = (
            target_labels / label_file.name
        )


        new_lines = []


        with open(
            label_file,
            "r",
            encoding="utf-8"
        ) as file:

            for line in file:

                parts = line.strip().split()


                if len(parts) >= 5:

                    # Change original class ID to 0
                    parts[0] = "0"

                    new_lines.append(
                        " ".join(parts)
                    )


        with open(
            output_file,
            "w",
            encoding="utf-8"
        ) as file:

            file.write(
                "\n".join(new_lines)
            )


print("\nDataset conversion completed.")

print(
    f"New dataset: {TARGET}"
)