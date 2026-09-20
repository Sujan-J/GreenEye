from ultralytics import YOLO


print("Loading GreenEye YOLO model...")

model = YOLO("yolo26n.pt")

print("Model loaded successfully.")


image_path = "bus.jpg"

print(f"Testing image: {image_path}")


results = model(
    image_path,
    conf=0.25,
    save=True
)


for result in results:

    print("\nDetected objects:")

    if result.boxes is None or len(result.boxes) == 0:

        print("No objects detected.")

        continue


    for box in result.boxes:

        class_id = int(box.cls[0])

        confidence = float(box.conf[0])

        class_name = result.names[class_id]

        print(
            f"- {class_name}: "
            f"{confidence:.2f}"
        )


print("\nGreenEye detection test completed.")