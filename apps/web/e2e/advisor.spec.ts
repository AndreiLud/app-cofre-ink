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
