"""Layout with other fonts. The page names system fonts only (Segoe UI and Consolas first), so a
Linux browser lays it out in DejaVu Sans / DejaVu Sans Mono or Liberation, a Mac in its own faces,
and any user may have a larger default font: the boxes must hold with any metrics. These run the
key layout checks of earlier rounds on `wide_page`, which swaps the UI and mono stacks for wider
faces (Verdana and Lucida Console on Windows, DejaVu on Linux) before any page script runs, so a
layout tuned to one font's widths fails on every machine, not only in CI."""
import test_gauntlet_r7 as r7
import test_gauntlet_r11 as r11
import test_gauntlet_r12 as r12
import test_gauntlet_r13 as r13
from helpers import ev, GRID_FIT, assert_grid_fits_or_says_more


def test_the_wide_fonts_are_in_use(wide_page):
    m = ev(wide_page, """() => { const cs = getComputedStyle(document.documentElement);
        return { ui: cs.getPropertyValue('--font'), mono: cs.getPropertyValue('--mono'),
          body: getComputedStyle(document.body).fontFamily, pre: getComputedStyle($('preview')).fontFamily }; }""")
    assert "Verdana" in m["ui"] and "Lucida Console" in m["mono"], m
    assert m["body"].startswith("Verdana") and m["pre"].startswith('"Lucida Console"'), m


def test_first_run_preview_keeps_twelve_lines(wide_page):
    r7.test_preview_keeps_twelve_lines_with_the_tips_banner(wide_page)


def test_preview_cue_matches_the_visible_lines(wide_page):
    r7.test_preview_cue_matches_the_visible_lines(wide_page)


def test_preview_boxes_end_at_a_whole_line(wide_page):
    r12.test_preview_boxes_end_at_a_whole_line(wide_page)


def test_ports_dialog_note_is_not_clipped(wide_page):
    r11.test_ports_dialog_note_is_not_clipped_and_the_preview_stays_visible(wide_page)


def test_policy_row_names_its_rule(wide_page):
    r13.test_policy_row_names_its_rule_without_overflowing(wide_page)


def test_grid_fits_its_card_at_1440_with_wider_fonts(wide_page):
    # The product promise, stricter than "fits or says more": at 1440 px beside the side panel
    # the whole row fits with these wider faces too (Site gives up its spare width first).
    r12.test_grid_fits_its_card_at_1440_with_the_policy_row(wide_page)
    m = ev(wide_page, GRID_FIT)
    assert m["tableOver"] <= 0.5 and m["moreIn"] and not m["hint"] and not m["fade"], m


def test_an_overflowing_grid_always_shows_its_affordance(wide_page):
    # Narrower windows with the panel still beside the grid: wherever the row no longer fits, the
    # hint and the fade say there is more; scrolled to the end, the "⋯" is in the box.
    page = wide_page
    r12._real(page)
    ev(page, """() => { const r = current(); r.switches = countedUpRows(r, [], 12).rows; renderAll(); showView('switches');
        selectSwitch(r.switches[11].id); }""")
    overflowed = False
    for width in (1440, 1360, 1280, 1220):
        page.set_viewport_size({"width": width, "height": 900})
        page.wait_for_timeout(120)
        m = ev(page, GRID_FIT)
        assert_grid_fits_or_says_more(m)
        overflowed = overflowed or m["tableOver"] > 0.5
    assert overflowed, "no width overflowed: the affordance went untested"
    ev(page, "() => { const box = $('swTable').closest('.scroll'); box.scrollLeft = box.scrollWidth; }")
    page.wait_for_timeout(120)
    m = ev(page, GRID_FIT)
    assert m["moreIn"] and not m["hint"] and not m["fade"], m
    assert page.problems == []
