// The long version of what the overview only hints at: what shape the money is in.
//
// The demonstration data is a household in reasonable shape with a few months behind
// it, which is exactly the case this screen exists for: enough to read the four signs,
// and something in the records worth pointing at.

import { expect, test } from "@playwright/test";
import { go, openCofre } from "./support.ts";

test.describe("the check up", () => {
	test("is one click from the overview, and says what shape the money is in", async ({ page }) => {
		await openCofre(page, { name: "Andrei", space: "Pessoal" });

		// The panel that says what needs attention now leads somewhere instead of just
		// growing longer.
		await expect(page.getByRole("heading", { name: "O que precisa de atenção" })).toBeVisible();
		await page.getByRole("link", { name: "Ver mais" }).click();

		await expect(page.getByRole("heading", { level: 1 })).toContainText("A sua situação");
		await expect(page.getByRole("heading", { name: "Os quatro sinais" })).toBeVisible();

		// Every sign is there, readable or not, with the line it is measured against.
		for (const name of [
			"Quanto sobra",
			"Reserva",
			"O que vence agora",
			"O que já está comprometido",
		]) {
			await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
		}
		await expect(page.getByText("Referência: 3 meses de gasto")).toBeVisible();

		// And it says where the figures came from, which is the whole claim it makes.
		await expect(page.getByText("Isto não é recomendação de investimento.")).toBeVisible();
	});

	test("turns a goal into a step with a month on it", async ({ page }) => {
		await openCofre(page, { name: "Andrei", space: "Pessoal" });

		// Somewhere for the money to sit, and a goal pointing at it. Until there is
		// something to save for, a household with a reserve already has no plan to show.
		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		await page.getByRole("dialog").getByLabel("Nome").fill("Reserva");
		await page.getByRole("dialog").getByLabel("Tipo").selectOption("savings");
		await page.getByRole("button", { name: "Salvar" }).click();

		await go(page, "Orçamento");
		await page.getByRole("button", { name: "Nova meta" }).click();
		await page.getByRole("dialog").getByLabel("Nome").fill("Viagem");
		await page.getByRole("dialog").getByLabel("Quanto", { exact: true }).fill("15.000,00");
		await page
			.getByRole("dialog")
			.getByLabel("Onde o dinheiro fica")
			.selectOption({ label: "Reserva" });
		await page.getByRole("button", { name: "Salvar" }).click();

		await go(page, "Diagnóstico");

		const plan = page.getByRole("heading", { name: "O plano" });
		await expect(plan).toBeVisible();

		// The step carries what is missing, what goes in each month and how long that
		// takes. The date under it is the same arithmetic said as a month.
		const step = page.getByRole("listitem").filter({ hasText: "Viagem" });
		await expect(step).toContainText("R$ 15.000,00");
		await expect(step).toContainText(/leva \d+ meses/);
		await expect(step).toContainText("até");
	});

	/**
	 * Six months of records written by hand, which is the least this can read: three
	 * closed months on each side of the comparison. The months are counted back from
	 * today rather than written down, so that this still means the same thing next year.
	 */
	test("compares the months just gone with the ones before, and the card ahead", async ({
		page,
	}) => {
		const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((back) => {
			const when = new Date();
			when.setUTCDate(1);
			when.setUTCMonth(when.getUTCMonth() - back);
			return `${when.getUTCFullYear()}-${String(when.getUTCMonth() + 1).padStart(2, "0")}`;
		});

		await openCofre(page, { name: "Andrei", demo: false });

		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		await page.getByLabel("Nome").fill("Banco");
		await page.getByLabel("Saldo de abertura").fill("1.000,00");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("cell", { name: "Banco", exact: true })).toBeVisible();

		await go(page, "Lançamentos");
		const quick = page.getByLabel("Lançamento rápido");
		const write = async (line: string) => {
			await quick.fill(line);
			await page.getByRole("button", { name: "Lançar", exact: true }).click();
			await expect(page.getByRole("button", { name: "Desfazer" })).toBeVisible();
		};

		for (const [index, month] of months.entries()) {
			// "recebi" is what marks money coming in. The description has to be a word
			// the reader does not already spend on something else, and "salario" is one
			// of the words that mean income: a line of nothing but keywords has no
			// description left and cannot be written.
			await write(`recebi Trabalho 6000,00 ${month}-05 banco`);
			// The three months just gone are the cheaper ones, so there is a direction.
			// And the ninth month back is the dear one, the kind that comes once a year:
			// far enough behind not to touch what an ordinary month is today.
			const spent = index === 8 ? "9000,00" : index < 3 ? "3500,00" : "4000,00";
			await write(`Mercado ${spent} ${month}-12 banco`);
		}

		// Something bought in parts, which is what spends a month before it arrives.
		await write("Geladeira 1200,00 6x banco");

		await go(page, "Diagnóstico");

		await expect(page.getByRole("heading", { name: "O que mudou" })).toBeVisible();
		const kept = page.getByRole("listitem").filter({ hasText: "O que sobra" });
		await expect(kept).toContainText("R$ 2.000,00");
		await expect(kept).toContainText("R$ 2.500,00");
		await expect(kept).toContainText("melhor");
		await expect(page.getByText(/o que você tem saiu de/i)).toBeVisible();

		// And the card panel, which here is the instalments rather than an invoice.
		await expect(page.getByRole("heading", { name: "O cartão" })).toBeVisible();
		await expect(page.getByText(/comprometido em parcelas/)).toBeVisible();

		await expect(page.getByText("mais do que sobra num mês")).toHaveCount(0);

		// One job, which is what most people have, and the one number that follows from
		// it: how long the money would last without it.
		await expect(page.getByRole("heading", { name: "De onde vem o dinheiro" })).toBeVisible();
		// Written in lower case in the records, and the subject of a sentence here.
		await expect(page.getByText(/Se Trabalho parar/)).toBeVisible();

		// And the month that cost three times the others, turned into a monthly figure.
		await expect(page.getByRole("heading", { name: "O que vem pela frente" })).toBeVisible();
		await expect(page.getByText(/acima de um mês normal/)).toBeVisible();
		await expect(page.getByText(/chega lá sem susto/)).toBeVisible();
	});

	test("is in the planning section, and reads a space with no history honestly", async ({
		page,
	}) => {
		await openCofre(page, { name: "Andrei", demo: false });
		await go(page, "Diagnóstico");

		await expect(page.getByRole("heading", { level: 1 })).toContainText("Ainda não dá para dizer");

		// The one sign that needs no history answers anyway, and the three that do say
		// why they cannot instead of showing a zero.
		await expect(page.getByText("Nada vence nos próximos 15 dias.")).toBeVisible();
		await expect(page.getByText("Sem leitura").first()).toBeVisible();
		await expect(page.getByText("Nada a apontar ainda")).toBeVisible();
	});
});
