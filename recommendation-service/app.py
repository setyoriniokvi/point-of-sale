# Microservice: Recommendation Service (Python Flask)

from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Mengaktifkan CORS

# Endpoint untuk rekomendasi re-stock
@app.route('/recommendation/restock', methods=['POST'])
def restock_recommendation():
    """
    Input: { "product_name": "...", "current_stock": 50 }
    Output: { "recommendation": "..." }
    """
    data = request.json
    product_name = data.get('product_name', 'Product')
    current_stock = data.get('current_stock')

    # Logika sederhana (Contoh Fitur 4.b)
    MINIMUM_STOCK = 10
    RECOMMENDED_QTY = 50

    if current_stock is not None and current_stock <= MINIMUM_STOCK:
        recommendation = f"Segera lakukan pemesanan untuk {product_name}. Stok saat ini: {current_stock}. Direkomendasikan restock {RECOMMENDED_QTY} unit."
    else:
        recommendation = f"{product_name} memiliki stok yang cukup ({current_stock}). Tidak ada rekomendasi restock saat ini."

    return jsonify({
        "product_name": product_name,
        "current_stock": current_stock,
        "recommendation": recommendation
    })

if __name__ == '__main__':
    # Flask berjalan di port 5000
    app.run(debug=True, host='0.0.0.0', port=5000)