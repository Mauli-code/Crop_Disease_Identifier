"""
CropDoc AI — Model Generator
Creates a MobileNetV2-based model for crop disease detection.
Architecture: 128x128 RGB input → MobileNetV2 base → Global Avg Pool → Dense 38 (softmax)

NOTE: This creates a model with RANDOM weights for demonstration.
For production accuracy, train this architecture on the PlantVillage dataset.

Usage:
    python create_model.py
"""

import os
import json
import numpy as np

def create_model():
    """Create a MobileNetV2-based model for 38-class crop disease detection."""
    import tensorflow as tf
    
    # Suppress TF warnings
    os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
    tf.get_logger().setLevel('ERROR')
    
    print("🔧 Creating MobileNetV2-based crop disease detection model...")
    print(f"   Input: 128×128×3 (RGB)")
    print(f"   Output: 38 classes (PlantVillage)")
    
    # Load knowledge base to get class count
    kb_path = os.path.join(os.path.dirname(__file__), "knowledge_base.json")
    with open(kb_path) as f:
        kb = json.load(f)
    num_classes = len(kb["classes"])
    print(f"   Classes from knowledge_base.json: {num_classes}")
    
    # Build model using MobileNetV2 (lightweight, efficient)
    base_model = tf.keras.applications.MobileNetV2(
        input_shape=(128, 128, 3),
        include_top=False,
        weights=None,  # Random weights for demo
        alpha=0.35     # Smallest MobileNetV2 variant for minimal size
    )
    
    model = tf.keras.Sequential([
        base_model,
        tf.keras.layers.GlobalAveragePooling2D(),
        tf.keras.layers.Dropout(0.3),
        tf.keras.layers.Dense(num_classes, activation='softmax')
    ])
    
    model.compile(
        optimizer='adam',
        loss='categorical_crossentropy',
        metrics=['accuracy']
    )
    
    model.summary()
    
    # Save as .h5
    h5_path = os.path.join(os.path.dirname(__file__), "model.h5")
    model.save(h5_path)
    print(f"\n✅ Model saved to: {h5_path}")
    
    # Get model file size
    size_mb = os.path.getsize(h5_path) / (1024 * 1024)
    print(f"   Size: {size_mb:.1f} MB")
    
    # Convert to TensorFlow.js format
    print("\n🔄 Converting to TensorFlow.js format...")
    tfjs_dir = os.path.join(os.path.dirname(__file__), "static", "models")
    os.makedirs(tfjs_dir, exist_ok=True)
    
    try:
        import tensorflowjs as tfjs
        tfjs.converters.save_keras_model(model, tfjs_dir)
        print(f"✅ TensorFlow.js model saved to: {tfjs_dir}")
        
        # List generated files
        for f in sorted(os.listdir(tfjs_dir)):
            fpath = os.path.join(tfjs_dir, f)
            fsize = os.path.getsize(fpath) / 1024
            print(f"   {f}: {fsize:.1f} KB")
    except ImportError:
        print("⚠️  tensorflowjs not installed. Install with: pip install tensorflowjs")
        print("   Then run: tensorflowjs_converter --input_format keras model.h5 static/models/")
    except Exception as e:
        print(f"⚠️  TensorFlow.js conversion failed: {e}")
        print("   Manual conversion: tensorflowjs_converter --input_format keras model.h5 static/models/")
    
    print("\n🎉 Model creation complete!")
    print("   To get accurate predictions, train this model on the PlantVillage dataset.")
    print("   Then replace model.h5 and re-run this script to update the TF.js version.")
    
    return model

if __name__ == "__main__":
    create_model()
