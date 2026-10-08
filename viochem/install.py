from viochem.patches import set_egp_symbol


def after_install():
	set_egp_symbol.execute()
