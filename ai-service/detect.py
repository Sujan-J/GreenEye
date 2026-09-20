from ultralytics import YOLO


print("Loading GreenEye YOLO model...")

model = YOLO("yolo26n.pt")

print("YOLO model loaded successfully.")


print("Running test detection...")

results = model(
    "https://ultralytics.com/images/bus.jpg",
    conf=0.25
)


for result in results:

    print("Detection completed.")

    print("Detected classes:")

    for class_id in result.boxes.cls.tolist():

        class_id = int(class_id)

        print(
            f"- {result.names[class_id]}"
        )


print("GreenEye YOLO test completed.")