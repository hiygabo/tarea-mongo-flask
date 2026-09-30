import os
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from flask import Flask, jsonify, render_template, request
from pymongo import MongoClient
from pymongo.collection import Collection


app = Flask(__name__)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
MONGO_DB = os.getenv("MONGO_DB", "bd_supermercado")
MONGO_COLLECTION = os.getenv("MONGO_COLLECTION", "producto")

mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
productos: Collection = mongo_client[MONGO_DB][MONGO_COLLECTION]


@app.get("/")
def inicio():
	return render_template("index.html")


def serializar_producto(producto: dict[str, Any]) -> dict[str, Any]:
	"""Convierte ObjectId y documentos Mongo en una respuesta JSON."""
	producto["_id"] = str(producto["_id"])
	return producto


def serializar_resultado(resultado: Any) -> Any:
	if isinstance(resultado, ObjectId):
		return str(resultado)
	if isinstance(resultado, list):
		return [serializar_resultado(item) for item in resultado]
	if isinstance(resultado, dict):
		return {clave: serializar_resultado(valor) for clave, valor in resultado.items()}
	return resultado


def obtener_id_producto(id_producto: str) -> ObjectId | None:
	try:
		return ObjectId(id_producto)
	except (InvalidId, TypeError):
		return None


def validar_producto(data: Any, parcial: bool = False) -> tuple[dict[str, Any] | None, str | None]:
	if not isinstance(data, dict):
		return None, "El cuerpo debe ser un objeto JSON"

	campos_requeridos = {"nombre", "presentacion", "precio", "proveedor"}
	faltantes = campos_requeridos - data.keys()
	if not parcial and faltantes:
		return None, f"Faltan campos requeridos: {', '.join(sorted(faltantes))}"

	producto = {campo: data[campo] for campo in campos_requeridos if campo in data}

	if "nombre" in producto and not isinstance(producto["nombre"], str):
		return None, "nombre debe ser texto"
	if "proveedor" in producto and not isinstance(producto["proveedor"], str):
		return None, "proveedor debe ser texto"
	if "precio" in producto and not isinstance(producto["precio"], (int, float)):
		return None, "precio debe ser numerico"
	if "presentacion" in producto:
		presentacion = producto["presentacion"]
		if not isinstance(presentacion, dict) or "cantidad" not in presentacion or "unidad" not in presentacion:
			return None, "presentacion debe incluir cantidad y unidad"
		if not isinstance(presentacion["cantidad"], (int, float)):
			return None, "presentacion.cantidad debe ser numerico"
		if not isinstance(presentacion["unidad"], str):
			return None, "presentacion.unidad debe ser texto"

	return producto, None


@app.get("/productos")
def listar_productos():
	return jsonify([serializar_producto(producto) for producto in productos.find()])


CONSULTAS = {
	"G1": [
		{"titulo": "Mostrar la base de datos", "descripcion": "Consulta la base de datos activa."},
		{"titulo": "Mostrar colecciones", "descripcion": "Lista las colecciones de la base de datos."},
		{"titulo": "Todos los productos", "descripcion": "Equivalente a db.producto.find()."},
		{"titulo": "Productos con formato", "descripcion": "Equivalente a db.producto.find().pretty()."},
		{"titulo": "Producto Pollo", "descripcion": "Busca productos cuyo nombre sea Pollo."},
		{"titulo": "Proveedor Molino", "descripcion": "Busca productos del proveedor Molino."},
	],
	"G2": [
		{"titulo": "Presentación en gramos", "descripcion": "Busca productos con unidad Grs en el objeto embebido."},
		{"titulo": "Tiene proveedor", "descripcion": "Verifica que exista el atributo proveedor."},
		{"titulo": "Sin proveedor", "descripcion": "Busca documentos donde proveedor no exista."},
		{"titulo": "Precio mayor o igual a 5", "descripcion": "Filtra productos con precio >= 5."},
		{"titulo": "Precio entre 3 y 7", "descripcion": "Filtra productos con precio >= 3 y <= 7."},
	],
	"G3": [
		{"titulo": "Nombres que empiezan con C", "descripcion": "Usa una expresión regular para buscar nombres que comiencen por C."},
		{"titulo": "Solo nombre", "descripcion": "Proyección que devuelve únicamente nombre."},
		{"titulo": "Nombre y precio", "descripcion": "Proyección que devuelve nombre y precio."},
		{"titulo": "Todos excepto proveedor", "descripcion": "Proyección que excluye el atributo proveedor."},
		{"titulo": "Condición OR", "descripcion": "Precio >= 1 o nombre mayor o igual que M."},
	],
	"G4": [
		{"titulo": "Condición AND", "descripcion": "Productos con precio >= 1 y nombre mayor o igual que M."},
		{"titulo": "Nombres que empiezan con C", "descripcion": "Usa $regex ^C para filtrar nombres."},
		{"titulo": "Nombres que terminan en o", "descripcion": "Usa $regex o$ para filtrar nombres."},
		{"titulo": "Suma de precios", "descripcion": "Calcula el total usando $sum sobre precio."},
		{"titulo": "Promedio de precios", "descripcion": "Calcula el promedio usando $avg sobre precio."},
		{"titulo": "Precio máximo", "descripcion": "Obtiene el mayor precio usando $max."},
		{"titulo": "Precio mínimo", "descripcion": "Obtiene el menor precio usando $min."},
	],
}


@app.get("/consultas")
def listar_consultas():
	return jsonify(CONSULTAS)


@app.get("/consultas/<grupo>/<int:numero>")
def ejecutar_consulta(grupo: str, numero: int):
	grupo = grupo.upper()
	if grupo not in CONSULTAS or numero < 1 or numero > len(CONSULTAS[grupo]):
		return jsonify({"error": "Consulta no encontrada"}), 404

	if grupo == "G1":
		if numero == 1:
			resultado = {"base_de_datos": MONGO_DB}
		elif numero == 2:
			resultado = {"colecciones": mongo_client[MONGO_DB].list_collection_names()}
		elif numero in (3, 4):
			resultado = list(productos.find())
		elif numero == 5:
			resultado = list(productos.find({"nombre": "Pollo"}))
		else:
			resultado = list(productos.find({"proveedor": "Molino"}))
	elif grupo == "G2":
		filtros = {
			1: {"presentacion.unidad": "Grs"},
			2: {"proveedor": {"$exists": True}},
			3: {"proveedor": {"$exists": False}},
			4: {"precio": {"$gte": 5}},
			5: {"precio": {"$gte": 3, "$lte": 7}},
		}
		resultado = list(productos.find(filtros[numero]))
	elif grupo == "G3":
		if numero == 1:
			resultado = list(productos.find({"nombre": {"$regex": "^C", "$options": "i"}}))
		elif numero == 2:
			resultado = list(productos.find({}, {"_id": 0, "nombre": 1}))
		elif numero == 3:
			resultado = list(productos.find({}, {"_id": 0, "nombre": 1, "precio": 1}))
		elif numero == 4:
			resultado = list(productos.find({}, {"proveedor": 0}))
		else:
			resultado = list(productos.find({"$or": [{"precio": {"$gte": 1}}, {"nombre": {"$gte": "M"}}]}))
	else:
		if numero == 1:
			resultado = list(productos.find({"$and": [{"precio": {"$gte": 1}}, {"nombre": {"$gte": "M"}}]}))
		elif numero == 2:
			resultado = list(productos.find({"nombre": {"$regex": "^C", "$options": "i"}}))
		elif numero == 3:
			resultado = list(productos.find({"nombre": {"$regex": "o$", "$options": "i"}}))
		else:
			operadores = {4: ("suma", "$sum"), 5: ("promedio", "$avg"), 6: ("maximo", "$max"), 7: ("minimo", "$min")}
			campo, operador = operadores[numero]
			resultado = list(productos.aggregate([
				{"$group": {"_id": None, campo: {operador: "$precio"}}},
				{"$project": {"_id": 0}},
			]))

	return jsonify({
		"grupo": grupo,
		"consulta": numero,
		"titulo": CONSULTAS[grupo][numero - 1]["titulo"],
		"resultado": serializar_resultado(resultado),
	})


@app.post("/productos")
def crear_producto():
	data, error = validar_producto(request.get_json(silent=True))
	if error:
		return jsonify({"error": error}), 400

	resultado = productos.insert_one(data)
	producto = productos.find_one({"_id": resultado.inserted_id})
	return jsonify(serializar_producto(producto)), 201


@app.get("/productos/<id_producto>")
def obtener_producto(id_producto: str):
	object_id = obtener_id_producto(id_producto)
	if object_id is None:
		return jsonify({"error": "El id no es valido"}), 400

	producto = productos.find_one({"_id": object_id})
	if producto is None:
		return jsonify({"error": "Producto no encontrado"}), 404
	return jsonify(serializar_producto(producto))


@app.put("/productos/<id_producto>")
def actualizar_producto(id_producto: str):
	object_id = obtener_id_producto(id_producto)
	if object_id is None:
		return jsonify({"error": "El id no es valido"}), 400

	data, error = validar_producto(request.get_json(silent=True), parcial=True)
	if error:
		return jsonify({"error": error}), 400
	if not data:
		return jsonify({"error": "Debes enviar al menos un campo para actualizar"}), 400

	resultado = productos.update_one({"_id": object_id}, {"$set": data})
	if resultado.matched_count == 0:
		return jsonify({"error": "Producto no encontrado"}), 404

	producto = productos.find_one({"_id": object_id})
	return jsonify(serializar_producto(producto))


@app.delete("/productos/<id_producto>")
def eliminar_producto(id_producto: str):
	object_id = obtener_id_producto(id_producto)
	if object_id is None:
		return jsonify({"error": "El id no es valido"}), 400

	resultado = productos.delete_one({"_id": object_id})
	if resultado.deleted_count == 0:
		return jsonify({"error": "Producto no encontrado"}), 404
	return jsonify({"mensaje": "Producto eliminado"})


@app.get("/health")
def health_check():
	try:
		mongo_client.admin.command("ping")
		return jsonify({"estado": "ok", "mongo": "conectado"})
	except Exception:
		return jsonify({"estado": "error", "mongo": "no disponible"}), 503


if __name__ == "__main__":
	app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5001")), debug=True)
