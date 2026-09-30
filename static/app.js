const state = {
    products: [],
    editingId: null,
};

const elements = {
    body: document.getElementById("products-body"),
    count: document.getElementById("product-count"),
    results: document.getElementById("results-label"),
    search: document.getElementById("search-input"),
    empty: document.getElementById("empty-state"),
    emptyTitle: document.getElementById("empty-title"),
    emptyCopy: document.getElementById("empty-copy"),
    emptyAction: document.getElementById("empty-action"),
    modal: document.getElementById("modal-backdrop"),
    modalTitle: document.getElementById("modal-title"),
    modalEyebrow: document.getElementById("modal-eyebrow"),
    form: document.getElementById("product-form"),
    formError: document.getElementById("form-error"),
    save: document.getElementById("save-button"),
    toast: document.getElementById("toast"),
    statusDot: document.getElementById("status-dot"),
    statusLabel: document.getElementById("status-label"),
    queryGroups: document.getElementById("query-groups"),
    queryResult: document.getElementById("query-result"),
    queryResultGroup: document.getElementById("query-result-group"),
    queryResultTitle: document.getElementById("query-result-title"),
    queryResultData: document.getElementById("query-result-data"),
};

function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => elements.toast.classList.remove("visible"), 2800);
}

async function request(url, options = {}) {
    let response;
    try {
        response = await fetch(url, {
            headers: { "Content-Type": "application/json" },
            ...options,
        });
    } catch (error) {
        throw new Error("No se pudo conectar con Flask. Ejecuta 'python app.py' y abre http://127.0.0.1:5001/");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "No se pudo completar la operación");
    return data;
}

function formatPrice(price) {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(price);
}

function filteredProducts() {
    const query = elements.search.value.trim().toLowerCase();
    if (!query) return state.products;
    return state.products.filter((product) => `${product.nombre} ${product.proveedor}`.toLowerCase().includes(query));
}

function createActionButton(label, title, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `icon-button ${className}`;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
}

function renderProducts() {
    const products = filteredProducts();
    elements.body.replaceChildren();
    elements.count.textContent = state.products.length;
    elements.results.textContent = `${products.length} resultado${products.length === 1 ? "" : "s"}`;

    products.forEach((product) => {
        const row = document.createElement("tr");
        const name = document.createElement("td");
        const nameWrap = document.createElement("div");
        const icon = document.createElement("span");
        icon.className = "product-icon";
        icon.textContent = (product.nombre || "?").slice(0, 1).toUpperCase();
        const nameText = document.createElement("span");
        nameText.textContent = product.nombre;
        nameWrap.className = "product-name";
        nameWrap.append(icon, nameText);
        name.append(nameWrap);

        const presentation = document.createElement("td");
        presentation.className = "subtle";
        presentation.textContent = `${product.presentacion.cantidad} ${product.presentacion.unidad}`;
        const supplier = document.createElement("td");
        supplier.textContent = product.proveedor;
        const price = document.createElement("td");
        price.className = "price";
        price.textContent = formatPrice(product.precio);
        const actions = document.createElement("td");
        const actionWrap = document.createElement("div");
        actionWrap.className = "action-buttons";
        actionWrap.append(
            createActionButton("✎", "Editar producto", "edit", () => openModal(product)),
            createActionButton("⌫", "Eliminar producto", "delete", () => deleteProduct(product)),
        );
        actions.append(actionWrap);
        row.append(name, presentation, supplier, price, actions);
        elements.body.append(row);
    });

    const isEmpty = products.length === 0;
    elements.empty.hidden = !isEmpty;
    if (state.products.length > 0 && isEmpty) {
        elements.emptyTitle.textContent = "No encontramos coincidencias";
        elements.emptyCopy.textContent = "Prueba con otro nombre o proveedor.";
        elements.emptyAction.hidden = true;
    } else {
        elements.emptyTitle.textContent = "Todavía no hay productos";
        elements.emptyCopy.textContent = "Crea el primer producto para comenzar tu catálogo.";
        elements.emptyAction.hidden = false;
    }
}

async function loadProducts() {
    try {
        state.products = await request("/productos");
        elements.statusDot.className = "status-dot online";
        elements.statusLabel.textContent = "MongoDB conectado";
        renderProducts();
    } catch (error) {
        state.products = [];
        elements.statusDot.className = "status-dot offline";
        elements.statusLabel.textContent = "MongoDB no disponible";
        elements.emptyTitle.textContent = "No se pudo cargar el catálogo";
        elements.emptyCopy.textContent = error.message;
        elements.emptyAction.hidden = true;
        elements.empty.hidden = false;
        elements.results.textContent = "Sin conexión";
    }
}

async function loadQueryGroups() {
    try {
        const groups = await request("/consultas");
        elements.queryGroups.replaceChildren();
        Object.entries(groups).forEach(([groupName, queries]) => {
            const group = document.createElement("section");
            group.className = "query-group";
            const heading = document.createElement("button");
            heading.type = "button";
            heading.className = "query-group-heading";
            const query = queries[0];
            heading.innerHTML = `<span class="group-tag">${groupName}</span><span class="group-query"><strong>${query.titulo}</strong><small>${query.descripcion}</small></span><span class="query-arrow">→</span>`;
            heading.addEventListener("click", () => executeQuery(groupName, 1, heading));
            group.append(heading);
            elements.queryGroups.append(group);
        });
    } catch (error) {
        elements.queryGroups.textContent = error.message;
    }
}

function formatQueryValue(value) {
    if (value === null || value === undefined) return "-";
    if (typeof value === "object") {
        if ("cantidad" in value && "unidad" in value) return `${value.cantidad} ${value.unidad}`;
        return Object.entries(value).map(([key, item]) => `${key}: ${item}`).join(", ");
    }
    return String(value);
}

function renderQueryResult(result) {
    elements.queryResultData.replaceChildren();
    if (!Array.isArray(result) || result.length === 0) {
        const empty = document.createElement("p");
        empty.className = "query-empty-result";
        empty.textContent = "La consulta no devolvió productos.";
        elements.queryResultData.append(empty);
        return;
    }

    const columns = [...new Set(result.flatMap((item) => Object.keys(item)).filter((key) => key !== "_id"))];
    const table = document.createElement("table");
    table.className = "query-result-table";
    const header = document.createElement("tr");
    columns.forEach((column) => {
        const cell = document.createElement("th");
        cell.textContent = column === "presentacion" ? "Presentación" : column;
        header.append(cell);
    });
    const tableHead = document.createElement("thead");
    tableHead.append(header);
    table.append(tableHead);
    const body = document.createElement("tbody");
    result.forEach((item) => {
        const row = document.createElement("tr");
        columns.forEach((column) => {
            const cell = document.createElement("td");
            cell.textContent = formatQueryValue(item[column]);
            row.append(cell);
        });
        body.append(row);
    });
    table.append(body);
    elements.queryResultData.append(table);
}

async function executeQuery(group, number, button) {
    const previousLabel = button.querySelector("strong").textContent;
    button.disabled = true;
    button.querySelector("strong").textContent = "Ejecutando...";
    try {
        const response = await request(`/consultas/${group}/${number}`);
        elements.queryResultGroup.textContent = `${response.grupo} / Consulta ${response.consulta}`;
        elements.queryResultTitle.textContent = response.titulo;
        renderQueryResult(response.resultado);
        elements.queryResult.hidden = false;
        elements.queryResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
        showToast(error.message);
    } finally {
        button.disabled = false;
        button.querySelector("strong").textContent = previousLabel;
    }
}

function setFormValue(name, value) {
    elements.form.elements[name].value = value ?? "";
}

function openModal(product = null) {
    state.editingId = product?._id || null;
    elements.modalTitle.textContent = product ? "Editar producto" : "Añadir producto";
    elements.modalEyebrow.textContent = product ? "Actualizar registro" : "Nuevo registro";
    elements.save.textContent = product ? "Guardar cambios" : "Guardar producto";
    elements.formError.hidden = true;
    setFormValue("nombre", product?.nombre);
    setFormValue("proveedor", product?.proveedor);
    setFormValue("precio", product?.precio);
    setFormValue("cantidad", product?.presentacion?.cantidad);
    setFormValue("unidad", product?.presentacion?.unidad);
    elements.modal.hidden = false;
    elements.form.elements.nombre.focus();
}

function closeModal() {
    elements.modal.hidden = true;
    elements.form.reset();
    state.editingId = null;
}

async function saveProduct(event) {
    event.preventDefault();
    const editing = Boolean(state.editingId);
    const formData = new FormData(elements.form);
    const product = {
        nombre: formData.get("nombre").trim(),
        proveedor: formData.get("proveedor").trim(),
        precio: Number(formData.get("precio")),
        presentacion: {
            cantidad: Number(formData.get("cantidad")),
            unidad: formData.get("unidad").trim(),
        },
    };
    elements.save.disabled = true;
    try {
        const url = state.editingId ? `/productos/${state.editingId}` : "/productos";
        await request(url, { method: state.editingId ? "PUT" : "POST", body: JSON.stringify(product) });
        closeModal();
        await loadProducts();
        showToast(editing ? "Producto actualizado" : "Producto creado");
    } catch (error) {
        elements.formError.textContent = error.message;
        elements.formError.hidden = false;
    } finally {
        elements.save.disabled = false;
    }
}

async function deleteProduct(product) {
    if (!window.confirm(`¿Eliminar ${product.nombre}?`)) return;
    try {
        await request(`/productos/${product._id}`, { method: "DELETE" });
        await loadProducts();
        showToast("Producto eliminado");
    } catch (error) {
        showToast(error.message);
    }
}

document.getElementById("new-product-button").addEventListener("click", () => openModal());
elements.emptyAction.addEventListener("click", () => openModal());
document.getElementById("close-modal").addEventListener("click", closeModal);
document.getElementById("cancel-modal").addEventListener("click", closeModal);
elements.form.addEventListener("submit", saveProduct);
elements.search.addEventListener("input", renderProducts);
elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) closeModal();
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.modal.hidden) closeModal();
});
document.getElementById("close-query-result").addEventListener("click", () => {
    elements.queryResult.hidden = true;
});

loadProducts();
loadQueryGroups();
