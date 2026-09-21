// Browser storage spike, page side. Starts the worker and renders what it reports.

const output = document.querySelector("#output");
const status = document.querySelector("#status");

let worker = null;

function line(label, value) {
	return `${label.padEnd(26, ".")} ${value}`;
}

function show(text) {
	output.textContent += `${text}\n`;
}

function setStatus(text, kind) {
	status.textContent = text;
	status.dataset.kind = kind;
}

function start(command) {
	output.textContent = "";
	setStatus("rodando", "running");
	worker?.terminate();
	worker = new Worker("./spikeWorker.js", { type: "module" });
	worker.onmessage = (event) => handle(event.data);
	worker.onerror = (event) => {
		setStatus("falhou ao carregar o worker", "failure");
		show(String(event.message ?? event));
	};
	worker.postMessage({ command });
}

function handle(message) {
	if (message.type === "log") {
		show(`sqlite: ${message.text}`);
		return;
	}
	if (message.type === "environment") {
		const environment = message.environment;
		show("ambiente");
		show(line("versao do sqlite", environment.sqliteVersion));
		show(line("isolamento de origem", environment.crossOriginIsolated ? "sim" : "nao"));
		show(line("SharedArrayBuffer", environment.sharedArrayBuffer ? "disponivel" : "ausente"));
		show(line("OPFS", environment.opfsAvailable ? "sim" : "nao"));
		show(line("acesso sincrono", environment.syncAccessHandle ? "sim" : "nao"));
		show(line("backend sahpool", environment.sahPoolInstaller ? "presente" : "ausente"));
		show(line("carregar o wasm", `${environment.initMs} ms`));
		show("");
		return;
	}
	if (message.type === "result") {
		const result = message.result;
		show("medidas");
		show(line("instalar o backend", `${result.poolMs} ms`));
		show(line("abrir o banco", `${result.openMs} ms`));
		show(line("inserir 5000 linhas", `${result.insertMs} ms`));
		show(line("agregar por mes", `${result.queryMs} ms`));
		show(line("tamanho do banco", `${result.databaseKilobytes} kB`));
		show("");
		show("persistencia");
		show(line("vezes que abriu", result.runCount));
		show(line("linhas antes", result.rowsBefore));
		show(line("linhas depois", result.rowsAfter));
		show(line("meses agregados", result.monthsFound));
		show(line("arquivos no pool", result.files.join(", ")));
		show("");
		const persisted = result.runCount > 1 && result.rowsBefore > 0;
		setStatus(
			persisted
				? "funciona: os dados sobreviveram ao recarregamento"
				: "primeira execucao: recarregue a pagina para confirmar a persistencia",
			persisted ? "success" : "running",
		);
		return;
	}
	if (message.type === "wiped") {
		setStatus("dados apagados", "running");
		show("o pool foi esvaziado, recarregue para comecar do zero");
		return;
	}
	if (message.type === "error") {
		setStatus("falhou", "failure");
		show(`erro: ${message.message}`);
		show(message.stack);
	}
}

document.querySelector("#again").addEventListener("click", () => start("measure"));
document.querySelector("#wipe").addEventListener("click", () => start("wipe"));

start("measure");
