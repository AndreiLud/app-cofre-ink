// Deciding money before spending it, and dividing what was spent together.

import { expect, test } from "@playwright/test";
import { go, openCofre, openSetting, record } from "./support.ts";

test.describe("the budget", () => {
	test("puts a limit on a category and says how it is doing", async ({ page }) => {
		await openCofre(page);
		await go(page, "Orçamento");

		await page.getByRole("button", { name: "Novo limite" }).first().click();
		// The radio itself is only for the screen reader, so a person clicks the label.
		await page.getByRole("dialog").getByText("Tudo", { exact: true }).click();
		await page.getByRole("dialog").getByLabel("Quanto por mês").fill("1.000,00");
		await page.getByRole("button", { name: "Salvar" }).click();

		// The demonstration data already spent something this month.
		const limit = page.getByRole("listitem").filter({ hasText: "Tudo" });
		await expect(limit).toBeVisible();
		await expect(limit).toContainText("R$ 1.000,00");
	});

	/**
	 * The hint under the field promises a comma or a period will do for the cents, and on
	 * this screen a period did the opposite of what it says.
	 *
	 * The reader here deleted every period before looking, so a limit of 1000.50 was saved
	 * as a hundred thousand and the bar said everything was comfortable all month, and
	 * 1,000.00 was saved as one real and the bar was over on the first purchase. The same
	 * reader decided the amount of the savings rule and the target of a goal, and a second
	 * copy of it, byte for byte, decided every price on the investments screen.
	 */
	test("reads a period as the cents, which is what the hint promises", async ({ page }) => {
		await openCofre(page, { demo: false });
		await go(page, "Orçamento");

		await page.getByRole("button", { name: "Novo limite" }).first().click();
		await page.getByRole("dialog").getByText("Tudo", { exact: true }).click();
		await page.getByRole("dialog").getByLabel("Quanto por mês").fill("1000.50");
		await page.getByRole("button", { name: "Salvar" }).click();

		const limit = page.getByRole("listitem").filter({ hasText: "Tudo" });
		await expect(limit).toContainText("R$ 1.000,50");
		await expect(limit).not.toContainText("R$ 100.050,00");

		// And a word is not an amount, which used to be saved as a limit of nothing
		// without anybody being told.
		await page.getByRole("button", { name: "Novo limite" }).first().click();
		await page.getByRole("dialog").getByText("Tudo", { exact: true }).click();
		await page.getByRole("dialog").getByLabel("Quanto por mês").fill("mil");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByText("Não consegui ler esse valor")).toBeVisible();
	});

	test("promises to save first and says whether the promise was kept", async ({ page }) => {
		await openCofre(page);
		await go(page, "Orçamento");

		await page.getByRole("button", { name: "Definir a regra" }).click();
		await page.getByRole("dialog").getByLabel("Porcentagem do que entra").fill("10");
		await page.getByRole("button", { name: "Salvar" }).click();

		// The demonstration person earned 6120, so the rule asks for 612.
		await expect(page.getByText("A regra é guardar 10 por cento")).toBeVisible();
		await expect(page.getByText("R$ 612,00")).toBeVisible();
		await expect(page.getByText("Ainda falta para cumprir")).toBeVisible();
	});

	test("keeps a goal and reads the account behind it", async ({ page }) => {
		await openCofre(page);

		// A place for the money to sit.
		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		await page.getByRole("dialog").getByLabel("Nome").fill("Reserva");
		await page.getByRole("dialog").getByLabel("Tipo").selectOption("savings");
		await page.getByRole("dialog").getByLabel("Saldo de abertura").fill("2.500,00");
		await page.getByRole("button", { name: "Salvar" }).click();

		await go(page, "Orçamento");
		await page.getByRole("button", { name: "Nova meta" }).click();
		await page.getByRole("dialog").getByLabel("Nome").fill("Reserva de emergência");
		await page.getByRole("dialog").getByLabel("Quanto", { exact: true }).fill("10.000,00");
		await page
			.getByRole("dialog")
			.getByLabel("Onde o dinheiro fica")
			.selectOption({ label: "Reserva" });
		await page.getByRole("button", { name: "Salvar" }).click();

		const goal = page.getByRole("listitem").filter({ hasText: "Reserva de emergência" });
		await expect(goal).toContainText("R$ 2.500,00");
		await expect(goal).toContainText("R$ 10.000,00");
	});
});

test.describe("dividing with the house", () => {
	test("splits an expense and clears the debt", async ({ page }) => {
		await openCofre(page);

		// The demonstration data comes with a shared space and a second person in it.
		await openSetting(page, "Gerenciar espaços");
		await page.getByRole("button", { name: "Entrar" }).click();
		await expect(page.getByRole("banner")).toContainText("Casa");

		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("200,00");
		await page.getByRole("dialog").getByLabel("Descrição").fill("Conta de luz da casa");
		await page.getByRole("button", { name: "Salvar" }).click();

		await record(page, "Conta de luz da casa").getByRole("button", { name: "Ações" }).click();
		await page.getByRole("menuitem", { name: "Dividir com a casa" }).click();
		await page.getByRole("button", { name: "Salvar" }).click();

		// Who owes whom lives with the people, not with the money.
		await openSetting(page, "Gerenciar espaços");
		await expect(page.getByText("Para zerar")).toBeVisible();
		await expect(page.getByText("R$ 100,00").first()).toBeVisible();

		await page.getByRole("button", { name: "Marcar como pago" }).first().click();
		await expect(page.getByText("Ninguém deve nada a ninguém")).toBeVisible();
	});

	/**
	 * A share belongs to the person it was typed for.
	 *
	 * The dialog reads people by name and the space holds them by when they arrived, so
	 * the two orders only agree by luck. Você comes after João in the alphabet and joined
	 * before him, which is the ordinary case of a household and the one that used to hand
	 * each share to the wrong person.
	 */
	test("gives each share to the person it was typed for", async ({ page }) => {
		await openCofre(page);

		await openSetting(page, "Gerenciar espaços");
		await page.getByRole("button", { name: "Entrar" }).click();
		await expect(page.getByRole("banner")).toContainText("Casa");

		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("400,00");
		await page.getByRole("dialog").getByLabel("Descrição").fill("Reforma da casa");
		await page.getByRole("button", { name: "Salvar" }).click();

		await record(page, "Reforma da casa").getByRole("button", { name: "Ações" }).click();
		await page.getByRole("menuitem", { name: "Dividir com a casa" }).click();

		const dialog = page.getByRole("dialog");
		await dialog.getByText("Por partes", { exact: true }).click();
		await dialog.getByLabel("Você").fill("3");
		await dialog.getByLabel("João (exemplo)").fill("1");
		await page.getByRole("button", { name: "Salvar" }).click();

		// Você paid the four hundred and owes three of the four parts, so what comes
		// back is one hundred. With the shares crossed over it would be three hundred.
		await openSetting(page, "Gerenciar espaços");
		await expect(page.getByText("Para zerar")).toBeVisible();
		// A sentence, and not a name dropped into a slot. It said "João (exemplo) paga
		// Você", with a capitalised pronoun in the middle, which in English came out as
		// "João pays You" beside rows reading "You owes" and "You is owed".
		await expect(page.getByText("João (exemplo) paga para você")).toBeVisible();
		await expect(page.getByText("R$ 100,00").first()).toBeVisible();

		// And the reader's own row reads as a sentence about them.
		await expect(page.getByText("tem a receber")).toBeVisible();
	});

	/**
	 * A share is a number of parts, and the sentence about one says so.
	 *
	 * The shares went through Number(), so a comma, a word or a minus sign became NaN and
	 * the division refused it with the sentence about an amount that could not be read,
	 * offering an example of 42,90 inside a dialog that holds no amounts at all. A share
	 * left empty said nothing and quietly wrote that person a part of zero.
	 */
	// Part 2, D.9 of the request for 2.0.0: dividing one part of a plan divided that part alone,
	// and the balance between people counted every division whatever its day.
	test("divides a whole plan, and owes each part on its own day", async ({ page }) => {
		await openCofre(page);
		await openSetting(page, "Gerenciar espaços");
		await page.getByRole("button", { name: "Entrar" }).click();
		await expect(page.getByRole("banner")).toContainText("Casa");

		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const form = page.getByRole("dialog");
		await form.getByLabel("Valor", { exact: true }).fill("2.400,00");
		await form.getByLabel("Descrição").fill("Geladeira da casa");
		await form.getByLabel("Parcelas", { exact: true }).selectOption({ label: "48 vezes" });
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(form).toHaveCount(0);

		await record(page, "Geladeira da casa 1/48").getByRole("button", { name: "Ações" }).click();
		await page.getByRole("menuitem", { name: "Dividir com a casa" }).click();
		await expect(page.getByRole("dialog")).toContainText(
			"É a parcela 1 de 48. A divisão vale para as 48 parcelas",
		);
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("dialog")).toHaveCount(0);

		await openSetting(page, "Gerenciar espaços");
		await expect(page.getByText("João (exemplo) paga para você")).toBeVisible();
		await expect(page.getByText("R$ 25,00").first()).toBeVisible();

		// A month later the second part has come, and only it.
		await page.clock.setFixedTime(new Date("2026-11-28T12:00:00-03:00"));
		await page.reload();
		await openSetting(page, "Gerenciar espaços");
		await expect(page.getByText("R$ 50,00").first()).toBeVisible({ timeout: 45_000 });
		await expect(page.getByText("R$ 25,00")).toHaveCount(0);
	});

	test("says what a share is when it cannot read one", async ({ page }) => {
		await openCofre(page);

		await openSetting(page, "Gerenciar espaços");
		await page.getByRole("button", { name: "Entrar" }).click();
		await expect(page.getByRole("banner")).toContainText("Casa");

		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("400,00");
		await page.getByRole("dialog").getByLabel("Descrição").fill("Reforma da casa");
		await page.getByRole("button", { name: "Salvar" }).click();

		await record(page, "Reforma da casa").getByRole("button", { name: "Ações" }).click();
		await page.getByRole("menuitem", { name: "Dividir com a casa" }).click();

		const dialog = page.getByRole("dialog");
		await dialog.getByText("Por partes", { exact: true }).click();
		await dialog.getByLabel("Você").fill("uma");
		await page.getByRole("button", { name: "Salvar" }).click();

		await expect(dialog.getByText("Cada parte é um número inteiro")).toBeVisible();
		await expect(dialog.getByText(/42,90/)).toHaveCount(0);

		// A share left empty is not a share of nothing.
		await dialog.getByLabel("Você").fill("");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(dialog.getByText("Cada parte é um número inteiro")).toBeVisible();

		// And a whole number saves.
		await dialog.getByLabel("Você").fill("3");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(dialog).toHaveCount(0);
	});
});

test.describe("what needs attention", () => {
	test("says on the overview when a limit is over", async ({ page }) => {
		await openCofre(page);
		await go(page, "Orçamento");

		// A limit small enough that the demonstration month is already past it.
		await page.getByRole("button", { name: "Novo limite" }).first().click();
		// The radio itself is only for the screen reader, so a person clicks the label.
		await page.getByRole("dialog").getByText("Tudo", { exact: true }).click();
		await page.getByRole("dialog").getByLabel("Quanto por mês").fill("10,00");
		await page.getByRole("button", { name: "Salvar" }).click();

		await go(page, "Painel");
		await expect(page.getByText("O que precisa de atenção")).toBeVisible();
		await expect(page.getByText(/^Tudo passou do limite em R\$/)).toBeVisible();
		// And "O mês até agora" names it beside what the month went on (part 1, E.5).
		await expect(page.getByText(/^Passou do limite: Tudo, R\$/)).toBeVisible();
	});
});
